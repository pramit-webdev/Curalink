import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Markdown from 'markdown-to-jsx';
import { Send, Sparkles, BookOpen, MapPin, Search, Plus, User, Terminal, ExternalLink, ShieldCheck, Activity, Clock } from 'lucide-react';

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

      setMessages(prev => prev.map(msg => 
        msg.id === botId ? { 
          ...msg, 
          content: `### ⚠️ Connection Glitch\nI encountered a technical issue while reaching the reasoning engine.\n\n**Diagnostic:**\n${debugInfo}\n\n**Troubleshooting:**\n1. Ensure [0.0.0.0/0] is added to your MongoDB Atlas Network Access.\n2. Verify the MONGODB_URI in your Render settings.\n3. Refresh this page and try again.`
        } : msg
      ));
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
            <Plus size={18} /> New Research
          </button>
        </div>
        
        <div style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', paddingLeft: '8px'}}>Recent</div>
        
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
          <div className="logo-text">Curalink</div>
        </header>

        <div className="chat-scroller">
          <div className="chat-container">
            {messages.length === 0 && (
              <div style={{textAlign: 'center', marginTop: '12vh', maxWidth: '750px', margin: '12vh auto'}}>
                <div style={{display: 'inline-flex', padding: '16px', borderRadius: '24px', marginBottom: '1.5rem'}}>
                   <Sparkles size={48} className="rainbow-flow" style={{color: 'var(--primary)'}} strokeWidth={1.5} />
                </div>
                <h1 style={{fontFamily: 'Outfit', fontSize: '2.5rem', marginBottom: '1rem', fontWeight: 800, letterSpacing: '-0.03em'}}>Precision Medical Intelligence</h1>
                <p style={{color: 'var(--text-muted)', fontSize: '1.15rem', marginBottom: '2.5rem', maxWidth: '600px', margin: '0 auto 2.5rem auto'}}>Curalink reasons over PubMed, OpenAlex, and ClinicalTrials.gov to find source-backed insights for your specific condition.</p>
                
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center'}}>
                  {[
                    { d: 'NSCLC', q: 'Latest KRAS G12C inhibitor results' },
                    { d: "Parkinson's", q: 'Phase 3 DBS trials in California' },
                    { d: 'Diabetes', q: 'Safety of off-label SGLT2 use' }
                  ].map((chip, i) => (
                    <button 
                      key={i}
                      onClick={() => setQuery(`${chip.d}: ${chip.q}`)}
                      className="mini-card"
                      style={{
                        background: 'rgba(255,255,255,0.04)', 
                        padding: '10px 22px', 
                        borderRadius: '100px',
                        fontSize: '0.85rem',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        animationDelay: `${i * 0.1}s`,
                        opacity: 1,
                        transform: 'none',
                        border: '1px solid rgba(255,255,255,0.05)'
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
                <div className={`avatar-container ${m.role}`}>
                  {m.role === 'user' ? <User size={20} /> : <Sparkles size={20} style={{color: 'var(--primary)'}} />}
                </div>
                <div className="message-body">
                  <div className="message-content">
                    {m.content ? (
                      <Markdown>{m.content}</Markdown>
                    ) : (
                      <div className="rainbow-sparkle">
                         <div className="rainbow-line"></div>
                         <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{m.status || 'Reasoning...'}</div>
                      </div>
                    )}
                  </div>

                  {m.role === 'bot' && ((m.papers && m.papers.length > 0) || (m.trials && m.trials.length > 0)) && (
                    <div className="inline-research">
                      <div style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <BookOpen size={14} /> Sources
                      </div>
                      {[...(m.papers || []), ...(m.trials || [])].slice(0, 5).map((source, sIdx) => (
                        <a key={sIdx} href={source.url} target="_blank" rel="noopener noreferrer" className="mini-card">
                          <div className="mini-card-title">{source.title}</div>
                          <div className="mini-card-meta">{source.source || 'Clinical Trial'}</div>
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

        {/* Smart Input Pill - Gemini Style */}
        <section className="input-area">
          <form className="smart-input-container" onSubmit={handleSend}>
            <button type="button" className="send-btn" style={{color: 'var(--text-muted)', marginBottom: '0'}}>
              <Plus size={20} />
            </button>
            
            <textarea 
              className="chat-input"
              placeholder="Enter a prompt here..." 
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
            
            <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
              <button type="button" className="send-btn" style={{color: 'var(--text-muted)', marginBottom: '0'}}>
                <Image size={19} />
              </button>
              <button type="button" className="send-btn" style={{color: 'var(--text-muted)', marginBottom: '0'}}>
                <Mic size={19} />
              </button>
              <button type="submit" className="send-btn" disabled={loading} style={{color: loading ? 'var(--text-muted)' : 'var(--primary)', background: loading ? 'transparent' : 'rgba(138, 180, 248, 0.1)'}}>
                {loading ? <Search className="pulse" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </form>
          <div style={{textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', marginTop: '0.75rem', letterSpacing: '0.02em'}}>
            Curalink may provide incorrect info. Verify critical medical research independently.
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
