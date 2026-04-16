import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Markdown from 'markdown-to-jsx';
import { Send, Activity, BookOpen, MapPin, Search, Plus, User, Terminal, ExternalLink, ShieldCheck } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [userId] = useState(() => 'guest_' + Math.random().toString(36).substr(2, 9));
  const [disease, setDisease] = useState('');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const resetSession = () => {
    setMessages([]);
    setQuery('');
    setDisease('');
    setLocation('');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!disease || !query) return;

    const userMessage = { 
      role: 'user', 
      content: query,
      context: { disease, location },
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages([...messages, userMessage]);
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/chat`, {
        user_id: userId,
        disease,
        query,
        location
      });

      const botMessage = {
        role: 'bot',
        content: response.data.response,
        intent: response.data.intent,
        papers: response.data.papers,
        trials: response.data.trials,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, botMessage]);
      setQuery(''); 
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: '### Connection Error\nI was unable to reach the Curalink Reasoner.',
        timestamp: new Date().toLocaleTimeString() 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={resetSession}>
            <Plus size={16} /> New Research
          </button>
        </div>
        <div style={{flex: 1, color: 'var(--text-dim)', fontSize: '0.75rem', padding: '10px'}}>
          Recent Research Sessions would appear here...
        </div>
        <div className="source-meta" style={{padding: '10px', opacity: 0.5}}>
          Curalink Engine v1.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header>
          <div style={{fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px'}}>
            <Activity size={18} color="var(--primary)" /> CURALINK REASONER
          </div>
        </header>

        <div className="chat-scroller">
          <div className="chat-container">
            {messages.length === 0 && (
              <div style={{textAlign: 'center', marginTop: '10vh', maxWidth: '600px', margin: '10vh auto'}}>
                <Activity size={48} color="var(--primary)" style={{marginBottom: '1rem'}} />
                <h1 style={{fontSize: '1.5rem', marginBottom: '1rem'}}>How can Curalink help your research?</h1>
                <p style={{color: 'var(--text-dim)'}}>Search PubMed, OpenAlex, and ClinicalTrials.gov with AI context-aware reasoning.</p>
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={idx} className={`message ${m.role}`}>
                <div className={`avatar ${m.role}`}>
                  {m.role === 'user' ? <User size={18} /> : <Activity size={18} />}
                </div>
                <div className="message-body">
                  {m.intent && <div className="intent-badge">Path: {m.intent}</div>}
                  <div className="message-content">
                    <Markdown>{m.content}</Markdown>
                  </div>

                  {m.role === 'bot' && m.papers && m.papers.length > 0 && (
                    <div className="inline-research">
                      {m.papers.slice(0, 3).map((paper, pIdx) => (
                        <a key={pIdx} href={paper.url} target="_blank" rel="noopener noreferrer" className="mini-card" style={{textDecoration: 'none'}}>
                          <div className="mini-card-title">{paper.title}</div>
                          <div className="mini-card-meta">{paper.source} • {paper.year}</div>
                        </a>
                      ))}
                    </div>
                  )}

                  {m.role === 'bot' && m.trials && m.trials.length > 0 && (
                    <div className="inline-research" style={{marginTop: '0.5rem'}}>
                      {m.trials.slice(0, 2).map((trial, tIdx) => (
                        <a key={tIdx} href={trial.url} target="_blank" rel="noopener noreferrer" className="mini-card" style={{textDecoration: 'none', borderLeft: '3px solid var(--accent)'}}>
                          <div className="mini-card-title">{trial.title}</div>
                          <div className="mini-card-meta">Trial • {trial.status}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="message bot">
                <div className="avatar bot"><Activity size={18} /></div>
                <div className="message-body">
                  <div className="pulse">Consulting medical databases and reasoning over papers...</div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Smart Input Pill */}
        <section className="input-area">
          <form className="smart-input-container" onSubmit={handleSend}>
            <div className="input-top">
              <input 
                placeholder="Condition (e.g. Lymphoma)" 
                value={disease} 
                onChange={e => setDisease(e.target.value)}
              />
              <input 
                placeholder="Location (Optional)" 
                value={location} 
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            <div className="input-main">
              <input 
                placeholder="Message Curalink..." 
                value={query} 
                onChange={e => setQuery(e.target.value)}
              />
              <button type="submit" className="send-btn" disabled={loading}>
                {loading ? <Search className="pulse" size={16} /> : <Send size={16} />}
              </button>
            </div>
          </form>
          <div style={{textAlign: 'center', fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.5rem'}}>
            Curalink may provide incorrect info. Verify critical medical research independently.
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
