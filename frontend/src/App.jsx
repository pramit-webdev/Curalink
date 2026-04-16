import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Markdown from 'markdown-to-jsx';
import { Send, Activity, BookOpen, MapPin, Search } from 'lucide-react';
import ResultsSidebar from './components/Research/ResultsSidebar';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [userId] = useState(() => 'guest_' + Math.random().toString(36).substr(2, 9));
  const [disease, setDisease] = useState('');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentResearch, setCurrentResearch] = useState({ papers: [], trials: [] });
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const copyReport = (content) => {
    navigator.clipboard.writeText(content);
    alert('Research Report copied to clipboard!');
  };

  const resetSession = () => {
    setMessages([]);
    setCurrentResearch({ papers: [], trials: [] });
    setQuery('');
    setDisease('');
    setLocation('');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!disease || !query) return;

    const userMessage = { 
      role: 'user', 
      content: `Search for **${query}** regarding **${disease}** ${location ? `in **${location}**` : ''}`,
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
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, botMessage]);
      setCurrentResearch({
        papers: response.data.papers,
        trials: response.data.trials
      });
      setQuery(''); 
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: '### Connection Error\nI was unable to reach the Curalink Reasoner. Please ensure your backend is deployed and reachable.',
        timestamp: new Date().toLocaleTimeString() 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <Activity size={24} color="var(--primary)" />
          CURALINK
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <div className="source-meta">Intelligence Engine v1.0</div>
          <button onClick={resetSession} style={{padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: '0.7rem'}}>
            RESET SESSION
          </button>
        </div>
      </header>

      <main>
        <section className="chat-section">
          <div className="messages">
            {messages.length === 0 && (
              <div className="message bot">
                <h3>Welcome to Curalink</h3>
                <p>I am your AI research companion. I search **PubMed**, **OpenAlex**, and **ClinicalTrials.gov** simultaneously to provide evidence-based medical insights.</p>
                <div style={{marginTop: '1rem', color: 'var(--text-dim)', fontSize: '0.8rem'}}>
                  Try entering a condition like "Type 2 Diabetes" and a query like "New SGLT2 inhibitors".
                </div>
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={`message ${m.role}`}>
                {m.intent && <div style={{fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase'}}>Research Path: {m.intent}</div>}
                <Markdown>{m.content}</Markdown>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8}}>
                  <div style={{fontSize: '0.6rem', opacity: 0.5}}>{m.timestamp}</div>
                  {m.role === 'bot' && (
                    <button 
                      onClick={() => copyReport(m.content)}
                      style={{padding: '4px 8px', fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)'}}
                    >
                      COPY REPORT
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="message bot pulse">Reasoning over retrieval candidate pool...</div>}
            <div ref={messagesEndRef} />
          </div>

          <form className="input-area" onSubmit={handleSend}>
            <div className="input-grid">
              <input 
                placeholder="Condition" 
                value={disease} 
                onChange={e => setDisease(e.target.value)}
              />
              <input 
                placeholder="What exactly are you researching?" 
                value={query} 
                onChange={e => setQuery(e.target.value)}
              />
              <input 
                placeholder="Location" 
                value={location} 
                onChange={e => setLocation(e.target.value)}
              />
              <button type="submit" disabled={loading}>
                {loading ? <Search className="pulse" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </form>
        </section>

        <ResultsSidebar 
          papers={currentResearch.papers} 
          trials={currentResearch.trials} 
          loading={loading} 
        />
      </main>
    </div>
  );
}

export default App;
