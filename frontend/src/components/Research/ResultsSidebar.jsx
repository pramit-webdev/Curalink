import React from 'react';
import { BookOpen, Activity, ExternalLink, ShieldCheck } from 'lucide-react';

const ResultsSidebar = ({ papers, trials, loading }) => {
  if (loading && !papers.length && !trials.length) {
    return (
      <div className="research-section pulse">
        <div className="results-card">
          <h3><Activity size={14} /> Intelligence Engine</h3>
          <div className="source-item">Initializing candidate pool...</div>
          <div className="source-item">Fetching PubMed (Metadata + Snippets)...</div>
          <div className="source-item">Aggregating ClinicalTrials.gov...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="research-section">
      <div className="results-card">
        <h3><BookOpen size={14} /> Scientific Publications</h3>
        {papers.length > 0 ? (
          papers.map((paper, idx) => (
            <div key={idx} className="source-item">
              <div className="source-title">{paper.title}</div>
              <div className="source-meta">
                <span className={`badge ${paper.source.toLowerCase()}`}>{paper.source}</span>
                {paper.year && ` • ${paper.year}`}
                {paper.authors && ` • ${paper.authors}`}
              </div>
              {paper.summary && <div className="source-snippet">{paper.summary}</div>}
              <a href={paper.url} target="_blank" rel="noopener noreferrer" className="source-link">
                View Publication <ExternalLink size={12} />
              </a>
            </div>
          ))
        ) : (
          <div className="source-meta">No matching publications found.</div>
        )}
      </div>

      <div className="results-card">
        <h3><ShieldCheck size={14} /> Active Clinical Trials</h3>
        {trials.length > 0 ? (
          trials.map((trial, idx) => (
            <div key={idx} className="source-item">
              <div className="source-title">{trial.title}</div>
              <div className="source-meta">
                <span className="badge trial">NCT ID (Live)</span>
                {trial.status && ` • ${trial.status}`}
                {trial.location && ` • ${trial.location}`}
              </div>
              {trial.summary && <div className="source-snippet">{trial.summary}</div>}
              <a href={trial.url} target="_blank" rel="noopener noreferrer" className="source-link">
                Protocol Details <ExternalLink size={12} />
              </a>
            </div>
          ))
        ) : (
          <div className="source-meta">No ongoing trials found for this region.</div>
        )}
      </div>
    </div>
  );
};

export default ResultsSidebar;
