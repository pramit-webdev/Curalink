import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Markdown from 'markdown-to-jsx';
import { Send, Activity, BookOpen, MapPin, Search } from 'lucide-react';
import ResultsSidebar from './components/Research/ResultsSidebar';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!disease || !query) return;

    const userMessage = { 
      role: 'user', 
      content: `${disease}: ${query} ${location ? `(Location: ${location})` : ''}`,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages([...messages, userMessage]);
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/chat`, {
        user_id: 'default_user',
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
      setQuery(''); // Clear query but keep disease
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'bot', content: 'Error connecting to the Curalink engine. Is the backend running?' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div className="logo">CURALINK <Activity size={20} style={{display: 'inline'}} /></div>
        <div className="source-meta">AI Medical Research Assistant</div>
      </header>

      <main>
        <section className="chat-section">
          <div className="messages">
            {messages.length === 0 && (
              <div className="message bot">
                Welcome to Curalink. I can help you search for the latest treatments, 
                publications, and clinical trials. Enter a disease and your specific question to begin.
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={`message ${m.role}`}>
                {m.intent && <div style={{fontSize: '0.7rem', color: 'var(--accent)', marginBottom: 4}}>INTENT: {m.intent}</div>}
                <Markdown>{m.content}</Markdown>
                <div style={{fontSize: '0.6rem', textAlign: 'right', marginTop: 4, opacity: 0.6}}>{m.timestamp}</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="input-area" onSubmit={handleSend}>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%'}}>
              <input 
                placeholder="Disease (e.g. Parkinson's)" 
                value={disease} 
                onChange={e => setDisease(e.target.value)}
                style={{flex: '1 1 150px'}}
              />
              <input 
                placeholder="Specific Query (e.g. Deep Brain Stimulation)" 
                value={query} 
                onChange={e => setQuery(e.target.value)}
                style={{flex: '2 1 300px'}}
              />
              <input 
                placeholder="Location (Optional)" 
                value={location} 
                onChange={e => setLocation(e.target.value)}
                style={{flex: '1 1 150px'}}
              />
              <button type="submit" disabled={loading}>
                {loading ? <Search className="pulse" /> : <Send />}
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
