import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Markdown from 'markdown-to-jsx';
import { Send, Activity, BookOpen, MapPin, Search, Plus, User, Terminal, ExternalLink, ShieldCheck } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  // 1. Persistent Identity & Session State
  const [userId] = useState(() => {
    const saved = localStorage.getItem('curalink_user_id');
    if (saved) return saved;
    const core = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('curalink_user_id', core);
    return core;
  });

  const [sessionId, setSessionId] = useState(() => 'sess_' + Date.now());
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 2. Data Fetching
  const fetchSessions = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/sessions/${userId}`);
      setSessions(resp.data);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  const loadSession = async (sId) => {
    setLoading(true);
    setSessionId(sId);
    try {
      const resp = await axios.get(`${API_BASE}/session/${sId}?user_id=${userId}`);
      // Format backend response to frontend message structure
      const history = resp.data.flatMap(turn => [
        { role: 'user', content: turn.message, timestamp: new Date(turn.timestamp).toLocaleTimeString() },
        { 
          role: 'bot', 
          content: turn.response, 
          papers: turn.results?.papers || [], 
          trials: turn.results?.trials || [],
          timestamp: new Date(turn.timestamp).toLocaleTimeString() 
        }
      ]);
      setMessages(history);
    } catch (err) {
      console.error("Failed to load session:", err);
    } finally {
      setLoading(false);
    }
  };

  const createNewChat = () => {
    setSessionId('sess_' + Date.now());
    setMessages([]);
    setQuery('');
  };

  useEffect(() => {
    scrollToBottom();
    if (messages.length === 0) fetchSessions();
    console.log("🚀 Curalink initialized. User:", userId);
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!query) return;

    const userMessage = { 
      role: 'user', 
      content: query,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages([...messages, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/chat`, {
        user_id: userId,
        session_id: sessionId,
        query: query,
        disease: '',
        location: ''
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
      fetchSessions(); // Refresh sidebar
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = error.response?.data?.detail || error.message;
      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: `### Connection Error
I was unable to reach the Curalink Reasoner.

**Technical Error:**
\`\`\`text
${errorMsg}
\`\`\`

**Troubleshooting:**
- Check the [Health Status](${API_BASE}/health)
- If it's a "Timeout," try a shorter query.
- Make sure your GROQ_API_KEY is active.`,
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
          <button className="new-chat-btn" onClick={createNewChat}>
            <Plus size={16} /> New Research
          </button>
        </div>
        
        <div className="sidebar-sessions">
          {sessions.length === 0 ? (
            <div className="empty-history">No past sessions yet</div>
          ) : (
            sessions.map((s) => (
              <button 
                key={s._id} 
                className={`session-item ${sessionId === s._id ? 'active' : ''}`}
                onClick={() => loadSession(s._id)}
              >
                <div className="session-title">{s.title || 'Untitled Research'}</div>
                <div className="session-date">{new Date(s.timestamp).toLocaleDateString()}</div>
              </button>
            ))
          )}
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
              <div style={{textAlign: 'center', marginTop: '10vh', maxWidth: '700px', margin: '10vh auto'}}>
                <div style={{display: 'inline-flex', padding: '12px', background: 'var(--primary-glow)', borderRadius: '20px', marginBottom: '1.5rem'}}>
                   <Activity size={32} color="var(--primary)" />
                </div>
                <h1 style={{fontSize: '2rem', marginBottom: '1rem', fontWeight: 800, letterSpacing: '-0.05em'}}>Precision Medical Intelligence</h1>
                <p style={{color: 'var(--text-dim)', fontSize: '1.1rem', marginBottom: '2rem'}}>Curalink reasons over PubMed, OpenAlex, and ClinicalTrials.gov to find source-backed insights for your specific condition.</p>
                
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center'}}>
                  {[
                    { d: 'NSCLC', q: 'Latest KRAS G12C inhibitor results' },
                    { d: "Parkinson's", q: 'Phase 3 DBS trials in California' },
                    { d: 'Diabetes', q: 'Safety of off-label SGLT2 use' }
                  ].map((chip, i) => (
                    <button 
                      key={i}
                      onClick={() => setQuery(`${chip.d}: ${chip.q}`)}
                      style={{
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid var(--card-border)', 
                        padding: '10px 16px', 
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        color: 'var(--primary)',
                        cursor: 'pointer'
                      }}
                    >
                      {chip.q}
                    </button>
                  ))}
                </div>
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
                  <div className="pulse" style={{fontWeight: 600}}>Consulting medical databases...</div>
                  <div style={{fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px'}}>
                    Waking up Reasoner (Cold Starts can take ~60s)...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Smart Input Pill */}
        <section className="input-area">
          <form className="smart-input-container" onSubmit={handleSend}>
            <div className="input-main">
              <textarea 
                className="chat-input"
                placeholder="Ask Curalink anything about medical research..." 
                value={query} 
                onChange={e => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                rows={1}
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
