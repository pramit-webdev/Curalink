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

    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    // Initial Bot Placeholder
    const botId = Date.now();
    setMessages(prev => [...prev, { 
      id: botId,
      role: 'bot', 
      content: '', 
      timestamp: new Date().toLocaleTimeString(),
      papers: [],
      trials: []
    }]);

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          query: query,
          disease: '',
          location: ''
        })
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = ""; // New: Buffer for handling partial chunks

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last (potentially partial) line in the buffer

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;
          try {
            const data = JSON.parse(line);
            console.log("📥 Stream data:", data);
            
            if (data.type === 'metadata') {
              setMessages(prev => prev.map(msg => 
                msg.id === botId ? { ...msg, papers: data.papers, trials: data.trials, intent: data.intent, status: '' } : msg
              ));
            } else if (data.type === 'status') {
              setMessages(prev => prev.map(msg => 
                msg.id === botId ? { ...msg, status: data.text } : msg
              ));
            } else if (data.type === 'chunk') {
              fullText += data.text;
              setMessages(prev => prev.map(msg => 
                msg.id === botId ? { ...msg, content: fullText, status: '' } : msg
              ));
            } else if (data.type === 'error') {
              throw new Error(data.detail);
            }
          } catch (e) {
            console.warn("Skipping partial/invalid line:", line);
          }
        }
      }

      // Sidebar Sync
      setTimeout(() => fetchSessions(), 1000);

    } catch (error) {
      console.error('Chat error:', error);
      
      let debugInfo = error.message;
      try {
        // Try to fetch health info for better error message
        const health = await fetch(`${API_BASE}/`).then(r => r.json());
        if (health.database !== 'connected') {
          debugInfo = "The backend is online, but it cannot connect to MongoDB Atlas. Check your IP Whitelist!";
        }
      } catch (e) {
        debugInfo = "The backend is unreachable. This is likely due to a CORS block or the server being asleep.";
      }

      setMessages(prev => [...prev, { 
        id: Date.now(), 
        role: 'bot', 
        content: `### ⚠️ Connection Error\nCould not reach the reasoning engine.\n\n**Diagnostic:**\n${debugInfo}\n\n**Troubleshooting:**\n1. Ensure [0.0.0.0/0] is added to your MongoDB Atlas Network Access.\n2. Verify the MONGODB_URI in your Render settings.\n3. Refresh this page and try again.` 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Cinematic Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{display: 'flex', gap: '10px'}}>
          <button className="new-chat-btn" style={{flex: 1}} onClick={createNewChat}>
            <Plus size={18} /> New Research
          </button>
          <button 
            className="new-chat-btn" 
            style={{width: '44px', padding: '0', justifyContent: 'center'}} 
            onClick={fetchSessions}
            title="Refresh History"
          >
            <Activity size={18} />
          </button>
        </div>
        
        <div className="sidebar-sessions">
          {sessions.length === 0 ? (
            <div className="empty-history">Initializing database...</div>
          ) : (
            sessions.map((s) => (
              <button 
                key={s._id} 
                className={`session-item ${sessionId === s._id ? 'active' : ''}`}
                onClick={() => loadSession(s._id)}
              >
                <div className="session-title">{s.title || 'Untitled Research'}</div>
                <div className="session-date">{new Date(s.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}</div>
              </button>
            ))
          )}
        </div>

        <div className="source-meta" style={{padding: '10px', opacity: 0.3, fontSize: '0.7rem', fontFamily: 'JetBrains Mono'}}>
          CURALINK ENGINE V1.0 - SECURE
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header>
          <div style={{fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '0.1em', color: 'var(--primary)'}}>
            <Activity size={16} /> PRECISION MEDICAL INTELLIGENCE
          </div>
          <div style={{opacity: 0.5, fontSize: '0.7rem', fontFamily: 'JetBrains Mono'}}>
            ID: {userId.split('_')[1]}
          </div>
        </header>

        <div className="chat-scroller" ref={scrollRef}>
          <div className="chat-container">
            {messages.length === 0 && !streamingText && (
              <div style={{textAlign: 'center', marginTop: '8vh', animation: 'slideInUp 1s ease-out'}}>
                <div style={{display: 'inline-flex', padding: '20px', background: 'rgba(0, 210, 255, 0.05)', borderRadius: '24px', border: '1px solid var(--border-glow)', marginBottom: '2rem'}}>
                   <Activity size={40} color="var(--primary)" />
                </div>
                <h1 style={{fontSize: '3rem', marginBottom: '1rem', fontWeight: 800, letterSpacing: '-0.04em', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>
                  Precision Medical Intelligence
                </h1>
                <p style={{color: 'var(--text-dim)', fontSize: '1.2rem', marginBottom: '3rem', maxWidth: '600px', margin: '0 auto 3rem'}}>
                  Curalink reasons over PubMed, OpenAlex, and ClinicalTrials.gov to find source-backed insights for your condition.
                </p>
                
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center'}}>
                  {[
                    { d: 'NSCLC', q: 'Latest KRAS G12C inhibitor results' },
                    { d: "Parkinson's", q: 'Phase 3 DBS trials in California' },
                    { d: 'Diabetes', q: 'Safety of off-label SGLT2 use' }
                  ].map((chip, i) => (
                    <button 
                      key={i}
                      className="mini-card"
                      style={{cursor: 'pointer', textAlign: 'center', padding: '1rem 1.5rem'}}
                      onClick={() => setQuery(`${chip.d}: ${chip.q}`)}
                    >
                      <span style={{color: 'var(--primary)', fontWeight: 800, fontSize: '0.7rem'}}>{chip.d}</span>
                      <span style={{color: '#fff', fontSize: '0.9rem'}}>{chip.q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`message ${m.role}`}>
                <div className={`avatar ${m.role}`}>
                  {m.role === 'user' ? <User size={20} /> : <Activity size={20} />}
                </div>
                <div className="message-body">
                  {m.intent && <div className="intent-badge">INTENT: {m.intent}</div>}
                  <div className="message-content">
                    <Markdown>{m.content}</Markdown>
                  </div>
                  
                  {m.papers && m.papers.length > 0 && (
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
            {loading && messages.length === 0 && (
              <div className="message bot">
                <div className="avatar bot"><Activity size={18} /></div>
                <div className="message-body">
                  <div className="pulse" style={{fontWeight: 600}}>Initializing Reasoner...</div>
                  <div style={{fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px'}}>
                    Server cold-starts can take ~60s on Free Tier.
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
