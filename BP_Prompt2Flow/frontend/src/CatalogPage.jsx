import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const CATEGORIES = ['Financie',
  'Hospodárstvo',
  'HR',
  'IT',
  'Marketing',
  'Operácie',
  'Právo',
  'Služby',
  'Školstvo',
  'Šport',
  'Územné celky',
  'Zákaznícky servis',
  'Zdravotníctvo',
  'Iné',];

const CATEGORY_COLORS = {
  'HR':                 { bg: '#f8efdc', text: '#7a5212', border: '#ead6ad' },
  'IT':                 { bg: '#e7eef6', text: '#2d4f73', border: '#c8d7e8' },
  'Financie':           { bg: '#e6f0eb', text: '#245c43', border: '#c4dccf' },
  'Operácie':           { bg: '#efecf3', text: '#4f4366', border: '#d9d2e3' },
  'Marketing':          { bg: '#f6e9ed', text: '#7a3347', border: '#e8cfd6' },
  'Zákaznícky servis':  { bg: '#f8ece2', text: '#7a3f1d', border: '#ebd1be' },
  'Iné':                { bg: '#f1efe9', text: '#555b62', border: '#dedad0' },
};

const Icon = {
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.2" y2="16.2"></line></svg>,
  Nodes: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="6" rx="1.5"></rect><rect x="14" y="14" width="7" height="6" rx="1.5"></rect><path d="M10 7h4a2 2 0 0 1 2 2v5"></path></svg>,
  User: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  Calendar: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><line x1="16" y1="3" x2="16" y2="7"></line><line x1="8" y1="3" x2="8" y2="7"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
  Globe: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="3" y1="12" x2="21" y2="12"></line><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"></path></svg>,
  Lock: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>,
  Trash: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  Folder: () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
  Alert: () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
};

const CategoryBadge = ({ category }) => {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Iné'];
  return (
    <span className="p2f-badge" style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}>
      {category || 'Iné'}
    </span>
  );
};

export default function CatalogPage({ username, onLogout, onLoadModel, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Všetky');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

    const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();

      const isPublicTab = activeTab === 'public';
      const url = isPublicTab
        ? `${API}/public-catalog?${params}`
        : `${API}/catalog?${params}`;

      const headers = isPublicTab
        ? {}
        : { 'Authorization': `Bearer ${token}` };

      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error('Načítanie zlyhalo');
      const data = await resp.json();
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id) => {
    if (!window.confirm('Naozaj vymazať tento diagram?')) return;
    setDeletingId(id);
    try {
      const token = localStorage.getItem('auth_token');
      const resp = await fetch(`${API}/catalog/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Vymazanie zlyhalo');
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      alert('Vymazanie zlyhalo.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleVisibility = async (id, currentIsPublic) => {
    try {
      const token = localStorage.getItem('auth_token');
      const newVisibility = !currentIsPublic;

      const resp = await fetch(`${API}/catalog/${id}/visibility`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_public: newVisibility })
      });

      if (!resp.ok) throw new Error('Zmena viditeľnosti zlyhala');

      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, is_public: newVisibility } : item
      ));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleLoad = (item) => {
    const { nodes, edges } = item.model_json;
    const rawNodes = nodes.map(n => ({
      id: n.id, type: 'task',
      data: {
        label: n.label, baseLabel: n.label,
        actor: n.actor || '', nodeType: n.type || 'task',
        isDecision: n.isDecision || false
      },
      position: { x: 0, y: 0 }
    }));
    const rawEdges = edges.map(e => ({
      id: e.id, source: e.source, target: e.target, label: e.label || null,
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed', color: '#8d9096' },
      style: { stroke: '#8d9096', strokeWidth: 1.75 },
      labelBgPadding: [8, 4], labelBgBorderRadius: 4,
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: '#d6d2c8', strokeWidth: 1 },
      labelStyle: { fill: '#1c2024', fontWeight: 600, fontSize: 12 },
    }));
    onLoadModel(rawNodes, rawEdges, item.prompt || '');
  };

    // Filtrovanie na strane klienta (vyhľadávanie + tab + kategória)
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.prompt || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'my' ? item.owner === username :
      activeTab === 'public' ? item.is_public : true;

    const itemCategory = item.category || 'Iné';
    const matchesCategory = activeCategory === 'Všetky' ? true : itemCategory === activeCategory;

    return matchesSearch && matchesTab && matchesCategory;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="p2f-catalog">
      <div className="p2f-catalog__inner">

        {/* Hlavička */}
        <div className="p2f-catalog__intro">
          <h2 className="p2f-catalog__title">
            Katalóg modelov
          </h2>
          <p className="p2f-catalog__meta">
            {items.length} uložených diagramov · prihlásený ako <strong>{username}</strong>
          </p>
        </div>

        {/* Vyhľadávanie + Tab prepínač */}
        <div className="p2f-catalog__controls">
          <label className="p2f-search">
            <Icon.Search />
            <input
              type="text"
              placeholder="Hľadaj podľa názvu alebo popisu..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="p2f-field"
              aria-label="Hľadať v katalógu"
            />
          </label>
          <div className="p2f-tabs" role="tablist" aria-label="Filter diagramov">
            {[
              { key: 'all', label: 'Všetky' },
              { key: 'my', label: 'Moje' },
              { key: 'public', label: 'Verejné' }
            ].map(tab => (
              <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} className="p2f-tab" onClick={() => setActiveTab(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtre podľa kategórie */}
        <div className="p2f-catalog__filters">
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat;
            return (
              <button key={cat} type="button" aria-pressed={isActive} className={`p2f-filter${isActive ? ' is-active' : ''}`} onClick={() => setActiveCategory(cat)}>
                {cat}
                {cat !== 'Všetky' && (
                  <span className="p2f-filter__count">
                    {items.filter(i => (i.category || 'Iné') === cat).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Obsah */}
        {loading ? (
        <div className="p2f-card-grid">
          {[1,2,3,4].map(i => (
            <div key={i} className="p2f-card">
              <div className="p2f-skeleton" style={{ height: '18px', width: '60%' }} />
              <div className="p2f-skeleton" style={{ width: '90%' }} />
              <div className="p2f-skeleton" style={{ width: '50%', marginBottom: 0 }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p2f-state p2f-state--error">
          <Icon.Alert />
          <h3>Chyba pri načítaní</h3>
          <p>{error}</p>
          <button type="button" onClick={fetchItems} className="p2f-btn p2f-btn--primary">
            Skúsiť znova
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p2f-state">
          <Icon.Folder />
          <h3>Žiadne diagramy</h3>
          <p>
            {searchQuery ? `Žiadny výsledok pre „${searchQuery}"` : 'V tejto kategórii nie sú žiadne uložené diagramy.'}
          </p>
        </div>
      ) : (
        <div className="p2f-card-grid">
          {filteredItems.map(item => {
            const isOwner = item.owner === username;

            return (
              <article key={item.id} className="p2f-card">
                {/* Hlavička karty */}
                <div className="p2f-card__head">
                  <h3 className="p2f-card__title">
                    {item.title}
                  </h3>
                  <div className="p2f-card__badges">
                    <CategoryBadge category={item.category || 'Iné'} />

                    {/* Tlačidlo pre zmenu viditeľnosti */}
                    <button
                      type="button"
                      onClick={() => isOwner ? handleToggleVisibility(item.id, item.is_public) : null}
                      disabled={!isOwner}
                      title={isOwner ? "Klikni pre zmenu viditeľnosti" : "Nemáš práva na zmenu"}
                      className={`p2f-visibility${item.is_public ? ' is-public' : ''}`}
                    >
                      {item.is_public ? <Icon.Globe /> : <Icon.Lock />}
                      {item.is_public ? 'Verejný' : 'Súkromný'}
                    </button>
                  </div>
                </div>

                {/* Popis (prompt) */}
                {item.prompt && (
                  <p className="p2f-card__prompt">
                    {item.prompt}
                  </p>
                )}

                {/* Meta info */}
                <div className="p2f-card__meta">
                  <span><Icon.Nodes /> {item.final_node_count} uzlov</span>
                  <span><Icon.User /> {item.owner}</span>
                  <span><Icon.Calendar /> {formatDate(item.created_at)}</span>
                </div>

                {/* Akcie */}
                <div className="p2f-card__actions">
                  <button type="button" onClick={() => handleLoad(item)} className="p2f-btn p2f-btn--primary p2f-card__load">
                    Načítať do editora
                  </button>
                  {isOwner && (
                    <button type="button" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="p2f-btn p2f-btn--danger" title="Vymazať diagram" aria-label="Vymazať diagram">
                      {deletingId === item.id ? '...' : <Icon.Trash />}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  </div>
);
}
