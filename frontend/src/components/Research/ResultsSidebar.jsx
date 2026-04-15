import React from 'react';

const ResultsSidebar = ({ papers, trials, loading }) => {
  if (loading && !papers.length) {
    return (
      <div className="research-section pulse">
        <h3>Depth Retrieval...</h3>
        <div className="results-card">Searching PubMed...</div>
        <div className="results-card">Searching OpenAlex...</div>
        <div className="results-card">Syncing ClinicalTrials.gov...</div>
      </div>
    );
  }

  return (
    <div className="research-section">
      <div className="results-card">
        <h3>Scientific Publications</h3>
        {papers.length > 0 ? (
          papers.map((paper, idx) => (
            <div key={idx} className="source-item">
              <div className="source-title">{paper.title}</div>
              <div className="source-meta">
                {paper.authors} • {paper.year} • {paper.source}
              </div>
              <a href={paper.url} target="_blank" rel="noopener noreferrer" className="source-link">View Source</a>
            </div>
          ))
        ) : (
          <div className="source-meta">No publications found yet.</div>
        )}
      </div>

      <div className="results-card">
        <h3>Clinical Trials</h3>
        {trials.length > 0 ? (
          trials.map((trial, idx) => (
            <div key={idx} className="source-item">
              <div className="source-title">{trial.title}</div>
              <div className="source-meta">
                Status: {trial.status} • {trial.location}
              </div>
              <a href={trial.url} target="_blank" rel="noopener noreferrer" className="source-link">Register / Details</a>
            </div>
          ))
        ) : (
          <div className="source-meta">No clinical trials found yet.</div>
        )}
      </div>
    </div>
  );
};

export default ResultsSidebar;
