import httpx
import xmltodict
import asyncio
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class ResearchService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=15.0)

    async def search_pubmed(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search PubMed for papers."""
        try:
            # Step 1: Search for IDs
            search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
            params = {
                "db": "pubmed",
                "term": query,
                "retmax": limit,
                "retmode": "json",
                "sort": "pub+date"
            }
            resp = await self.client.get(search_url, params=params)
            resp.raise_for_status()
            data = resp.json()
            ids = data.get("esearchresult", {}).get("idlist", [])

            if not ids:
                return []

            # Step 2: Fetch details for IDs
            fetch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
            fetch_params = {
                "db": "pubmed",
                "id": ",".join(ids),
                "retmode": "xml"
            }
            fetch_resp = await self.client.get(fetch_url, params=fetch_params)
            fetch_resp.raise_for_status()
            
            # Parse XML
            xml_data = xmltodict.parse(fetch_resp.text)
            articles = xml_data.get("PubmedArticleSet", {}).get("PubmedArticle", [])
            
            if not isinstance(articles, list):
                articles = [articles]

            results = []
            for art in articles:
                medline = art.get("MedlineCitation", {})
                article = medline.get("Article", {})
                title = article.get("ArticleTitle", "N/A")
                abstract_data = article.get("Abstract", {}).get("AbstractText", "")
                
                # Abstract can be a list or a string
                if isinstance(abstract_data, list):
                    abstract = " ".join([item.get("#text", str(item)) if isinstance(item, dict) else str(item) for item in abstract_data])
                elif isinstance(abstract_data, dict):
                    abstract = abstract_data.get("#text", "No abstract available.")
                else:
                    abstract = abstract_data or "No abstract available."

                pmid = medline.get("PMID", {}).get("#text", "N/A")
                
                results.append({
                    "id": pmid,
                    "title": title,
                    "summary": abstract[:500] + "..." if len(abstract) > 500 else abstract,
                    "authors": self._parse_pubmed_authors(article.get("AuthorList", {})),
                    "year": article.get("Journal", {}).get("JournalIssue", {}).get("PubDate", {}).get("Year", "N/A"),
                    "source": "PubMed",
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
                })
            return results
        except Exception as e:
            logger.error(f"PubMed search error: {e}")
            return []

    def _parse_pubmed_authors(self, author_list: Dict[str, Any]) -> str:
        authors = author_list.get("Author", [])
        if not isinstance(authors, list):
            authors = [authors]
        
        names = []
        for auth in authors[:3]: # Get first 3 authors
            last = auth.get("LastName", "")
            first = auth.get("ForeName", "")
            if last:
                names.append(f"{last} {first}".strip())
        
        author_str = ", ".join(names)
        if len(authors) > 3:
            author_str += " et al."
        return author_str or "Unknown Authors"

    async def search_openalex(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search OpenAlex for publications."""
        try:
            url = "https://api.openalex.org/works"
            params = {
                "search": query,
                "per-page": limit,
                "sort": "relevance_score:desc"
            }
            resp = await self.client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            
            results = []
            for work in data.get("results", []):
                # OpenAlex abstract is inverted index, but often they have a display_name title
                results.append({
                    "id": work.get("id"),
                    "title": work.get("display_name", "N/A"),
                    "summary": "No summary available from OpenAlex API directly for speed.", # Need secondary call for abstract usually
                    "authors": ", ".join([auth.get("author", {}).get("display_name", "") for auth in work.get("authorships", [])[:3]]),
                    "year": work.get("publication_year", "N/A"),
                    "source": "OpenAlex",
                    "url": work.get("doi") or work.get("ids", {}).get("mag") or work.get("id")
                })
            return results
        except Exception as e:
            logger.error(f"OpenAlex search error: {e}")
            return []

    async def search_clinical_trials(self, disease: str, query: str = "", limit: int = 20) -> List[Dict[str, Any]]:
        """Search ClinicalTrials.gov v2."""
        try:
            url = "https://clinicaltrials.gov/api/v2/studies"
            search_query = f"{disease} {query}".strip()
            params = {
                "query.cond": disease,
                "query.term": query,
                "pageSize": limit,
                "format": "json"
            }
            resp = await self.client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            
            results = []
            for study in data.get("studies", []):
                protocol = study.get("protocolSection", {})
                id_info = protocol.get("identificationModule", {})
                status_info = protocol.get("statusModule", {})
                desc_info = protocol.get("descriptionModule", {})
                eligibility_info = protocol.get("eligibilityModule", {})
                contacts_info = protocol.get("contactsLocationsModule", {})

                results.append({
                    "id": id_info.get("nctId", "N/A"),
                    "title": id_info.get("briefTitle", "N/A"),
                    "status": status_info.get("overallStatus", "UNKNOWN"),
                    "summary": desc_info.get("briefSummary", "No summary available."),
                    "eligibility": eligibility_info.get("eligibilityCriteria", "Not specified."),
                    "location": self._parse_trial_location(contacts_info),
                    "source": "ClinicalTrials.gov",
                    "url": f"https://clinicaltrials.gov/ct2/show/{id_info.get('nctId')}"
                })
            return results
        except Exception as e:
            logger.error(f"ClinicalTrials error: {e}")
            return []

    def _parse_trial_location(self, contacts_info: Dict[str, Any]) -> str:
        locations = contacts_info.get("locations", [])
        if not locations:
            return "Multiple Locations"
        loc = locations[0]
        facility = loc.get("facility", "N/A")
        city = loc.get("city", "")
        country = loc.get("country", "")
        return f"{facility}, {city}, {country}".strip(", ")

    async def close(self):
        await self.client.aclose()


class ResearchCoordinator:
    def __init__(self):
        self.service = ResearchService()

    async def get_comprehensive_research(self, disease: str, pubmed_query: str, clinical_query: str, location: str = "", limit: int = 100) -> Dict[str, Any]:
        """Orchestrates multi-source fetching with safety limits and deduplication."""
        
        # Safety Shield: Prevent broad/empty searches from crashing the system
        if not disease or len(disease) < 2:
            return {"papers": [], "trials": []}

        # Stage 1: Parallel Fetching
        results = await asyncio.gather(
            self.service.search_pubmed(pubmed_query, limit=limit),
            self.service.search_openalex(pubmed_query, limit=limit),
            self.service.search_clinical_trials(disease, clinical_query, limit=20)
        )

        pubmed_results, openalex_results, trials_results = results

        # Stage 2: Merge and Deduplicate (Filtering)
        # Using a dict with titles as keys for basic deduplication
        papers_pool = {}
        for paper in pubmed_results + openalex_results:
            title_id = paper["title"].lower().strip()
            if title_id not in papers_pool:
                papers_pool[title_id] = paper
            else:
                # If duplicate, prefer PubMed data for citations
                if paper["source"] == "PubMed":
                    papers_pool[title_id] = paper

        # Stage 3: Re-Ranking (Refinement)
        # Simple scoring: Boost by recency and source
        sorted_papers = sorted(
            papers_pool.values(),
            key=lambda x: (
                1 if str(x.get("year", "0")).isdigit() and int(x.get("year", "0")) >= 2024 else 0,
                1 if x.get("source") == "PubMed" else 0
            ),
            reverse=True
        )

        return {
            "papers": sorted_papers[:8],  # Top 8 as required
            "trials": trials_results[:8]   # Top 8 as required
        }
