


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MemoryRouter as Router, Routes, Route, Link, NavLink, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useOparlList, useOparlItem } from './hooks/useOparl';
import { getList, getItem } from './services/oparlApiService';
import { askGemini, Attachment } from './services/aiService';
import { useFavorites } from './hooks/useFavorites';
import { Meeting, Paper, Person, Organization, AgendaItem, Consultation, File as OparlFile, Location as OparlLocation } from './types';
import { LoadingSpinner, ErrorMessage, Card, Pagination, PageTitle, DetailSection, DetailItem, DownloadLink, CalendarDaysIcon, DocumentTextIcon, HomeIcon, UsersIcon, BuildingLibraryIcon, LinkIcon, GeminiCard, SparklesIcon, TableSkeleton, FavoriteButton, StarIconSolid, ArchiveBoxIcon } from './components/ui';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: <HomeIcon /> },
  { path: '/meetings', label: 'Sitzungen', icon: <CalendarDaysIcon /> },
  { path: '/archive', label: 'Sitzungsarchiv', icon: <ArchiveBoxIcon /> },
  { path: '/papers', label: 'Vorlagen', icon: <DocumentTextIcon /> },
  { path: '/people', label: 'Personen', icon: <UsersIcon /> },
  { path: '/organizations', label: 'Gremien', icon: <BuildingLibraryIcon /> },
];

// Helper to encode URL for router param - URL SAFE BASE64
// Standard Base64 uses '+' and '/', which break react-router paths.
const encodeUrl = (url: string) => {
    return btoa(encodeURIComponent(url))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const decodeUrl = (encoded: string) => {
    try {
        let str = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        return decodeURIComponent(atob(str));
    } catch (e) {
        console.error("Failed to decode URL:", encoded);
        return "";
    }
};

// Helper for consistent date formatting
const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return `Ungültiges Datum: ${dateStr}`;

        // Use explicit options for a more consistent format (DD.MM.YYYY HH:mm)
        return new Intl.DateTimeFormat('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date).replace(',', '');
    } catch (e) {
        return `Formatierungsfehler: ${dateStr}`;
    }
};

// Helper for sorting meetings chronologically
const getMeetingTimestamp = (dateStr?: string) => {
    if (!dateStr) return -1;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? -1 : date.getTime();
};

const sortMeetingsAsc = (a: Meeting, b: Meeting) => {
    const timeA = getMeetingTimestamp(a.start);
    const timeB = getMeetingTimestamp(b.start);
    
    if (timeA === -1 && timeB === -1) return 0;
    if (timeA === -1) return 1;
    if (timeB === -1) return -1;

    const diff = timeA - timeB;
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
};

const sortMeetingsDesc = (a: Meeting, b: Meeting) => {
    const timeA = getMeetingTimestamp(a.start);
    const timeB = getMeetingTimestamp(b.start);
    
    if (timeA === -1 && timeB === -1) return 0;
    if (timeA === -1) return 1;
    if (timeB === -1) return -1;

    const diff = timeB - timeA;
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
};

// Stop words for keyword extraction (German + Bureaucratic terms)
const STOP_WORDS = new Set([
    'der', 'die', 'das', 'und', 'in', 'von', 'für', 'mit', 'an', 'den', 'im', 'auf', 'des', 'ist', 'eine', 'zu', 'bei', 
    'stadt', 'köln', 'bezirksvertretung', 'ausschuss', 'rat', 'sitzung', 'antrag', 'mitteilung', 'beschlussvorlage', 
    'anfrage', 'änderungsantrag', 'niederschrift', 'betreff', 'vorlage', 'verwaltung', 'top', 'dem', 'zur', 'über', 
    'durch', 'oder', 'sowie', 'sich', 'aus', 'ein', 'einer', 'eines', 'zum', 'als', 'nach', 'vom', 'dass', 'wir', 
    'ihr', 'sie', 'werden', 'wurde', 'diese', 'dieser', 'dieses', 'vor', 'unter', 'hier', 'dort', 'alle', 'einen',
    'koeln', 'gemäß', 'betr', 'wg', 'bzgl', 'anlage', 'anlagen'
]);

// Layout Components
const Header: React.FC = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter(x => x);

    const routeNameMap: Record<string, string> = {
        meetings: 'Sitzungen',
        papers: 'Vorlagen',
        people: 'Personen',
        organizations: 'Gremien',
        archive: 'Archiv'
    };

    return (
        <header className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 p-4 flex items-center sticky top-0 z-20 h-16">
            <div className="flex items-center flex-shrink-0 mr-8">
                <Link to="/" className="flex items-center space-x-3">
                    <span className="text-2xl">🏛️</span>
                    <div>
                        <h1 className="text-xl font-bold text-white hidden sm:block">Ratsinfo Köln</h1>
                        <h1 className="text-xl font-bold text-white sm:hidden">Ratsinfo</h1>
                        <p className="text-xs text-gray-400 hidden sm:block">OParl Explorer</p>
                    </div>
                </Link>
            </div>

            {/* Breadcrumbs */}
            {pathnames.length > 0 && (
                <nav className="hidden md:flex items-center text-sm text-gray-400 overflow-hidden whitespace-nowrap">
                    <span className="mx-2 text-gray-600">/</span>
                    {pathnames.map((value, index) => {
                        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
                        const isLast = index === pathnames.length - 1;
                        
                        const displayName = routeNameMap[value] || 'Details';

                        return (
                            <React.Fragment key={to}>
                                {index > 0 && <span className="mx-2 text-gray-600">/</span>}
                                {isLast ? (
                                    <span className="text-red-400 font-medium truncate max-w-[200px]">{displayName}</span>
                                ) : (
                                    <Link to={to} className="hover:text-white transition-colors">
                                        {displayName}
                                    </Link>
                                )}
                            </React.Fragment>
                        );
                    })}
                </nav>
            )}
        </header>
    );
};

const Sidebar: React.FC = () => (
    <nav className="p-4 space-y-2 h-full overflow-y-auto">
        {NAV_ITEMS.map(item => (
            <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                    `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                            ? 'bg-red-800 text-white'
                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`
                }
            >
                {item.icon}
                <span className="ml-3 hidden md:inline">{item.label}</span>
                <span className="ml-3 md:hidden inline-block">{item.label}</span>
            </NavLink>
        ))}
    </nav>
);

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-[#111827]">
        <aside className="w-full md:w-64 bg-gray-900 border-r border-gray-800 flex-shrink-0 flex flex-col md:h-full h-auto z-10">
            <Header />
            <div className="hidden md:block flex-1 overflow-y-auto">
                <Sidebar />
            </div>
            <div className="md:hidden flex overflow-x-auto border-b border-gray-700 bg-gray-900">
                <Sidebar />
            </div>
        </aside>
        <main className="flex-1 p-4 md:p-8 overflow-y-auto scroll-smooth relative">
            {children}
        </main>
    </div>
);

// --- Charts & Statistics ---

interface PartyStats {
    name: string;
    count: number;
    percentage: number;
}

const PartyActivityChart: React.FC<{ year?: string }> = ({ year: targetYear }) => {
    const [stats, setStats] = useState<PartyStats[]>([]);
    const [year, setYear] = useState<string>(targetYear || '');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        
        const fetchStats = async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams();
                params.set('limit', '200'); // Balanced limit for performance
                params.set('sort', '-date');
                
                // Pass signal to getList
                const result = await getList<Paper>('papers', params, controller.signal);
                
                if (controller.signal.aborted) return;

                let activeYear = targetYear;
                if (!activeYear) {
                    const years = new Set<string>();
                    result.data.forEach(p => {
                        if (p.date) years.add(p.date.substring(0, 4));
                    });
                    const sortedYears = Array.from(years).sort().reverse();
                    activeYear = sortedYears[0] || new Date().getFullYear().toString();
                }
                setYear(activeYear);

                const counts = new Map<string, number>();
                let totalCount = 0;
                
                result.data.forEach(paper => {
                    if (paper.date && paper.date.startsWith(activeYear)) {
                        const isMotion = (paper.paperType && paper.paperType.toLowerCase().includes('antrag')) || 
                                       (paper.name && paper.name.toLowerCase().includes('antrag'));

                        if (isMotion && paper.originator && paper.originator.length > 0) {
                            paper.originator.forEach(orgUrl => {
                                counts.set(orgUrl, (counts.get(orgUrl) || 0) + 1);
                                totalCount++;
                            });
                        }
                    }
                });

                if (totalCount === 0) {
                    if (!controller.signal.aborted) {
                        setStats([]);
                        setLoading(false);
                    }
                    return;
                }

                const sortedEntries = Array.from(counts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8);

                // Fetch organization details in parallel to improve performance
                const statsPromises = sortedEntries.map(async ([url, count]) => {
                    if (controller.signal.aborted) return null;
                    try {
                        const org = await getItem<Organization>(url, controller.signal);
                        return {
                            name: org.name || org.shortName || 'Unbekannt',
                            count: count,
                            percentage: (count / totalCount) * 100
                        };
                    } catch (e) {
                        return { name: 'Unbekanntes Gremium', count, percentage: (count/totalCount)*100 };
                    }
                });

                const fetchedStats = await Promise.all(statsPromises);

                if (!controller.signal.aborted) {
                    const validStats = fetchedStats.filter((s): s is PartyStats => s !== null);
                    validStats.sort((a, b) => b.count - a.count);
                    setStats(validStats);
                    setLoading(false);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.error(err);
                if (!controller.signal.aborted) {
                    setError("Daten konnten nicht geladen werden.");
                    setLoading(false);
                }
            }
        };

        fetchStats();
        return () => { controller.abort(); };
    }, [targetYear]);

    if (loading) return <div className="h-64 flex items-center justify-center"><LoadingSpinner /></div>;
    if (error) return <div className="p-4 text-red-400 text-sm bg-gray-800/50 rounded border border-red-900/50">{error}</div>;
    
    return (
        <div>
             <p className="text-sm text-gray-400 mb-6">
                Anzahl der eingereichten Anträge nach Fraktion im Jahr {year} (Top 8).
            </p>
            {stats.length === 0 ? (
                <div className="p-4 text-gray-400 text-sm bg-gray-700/30 rounded">
                    Keine Anträge für {year} gefunden.
                </div>
            ) : (
                <div className="space-y-5">
                    {stats.map((stat, index) => (
                        <div key={index} className="group">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="font-medium text-gray-200 group-hover:text-white transition-colors">{stat.name}</span>
                                <span className="text-gray-400 font-mono">{stat.count}</span>
                            </div>
                            <div className="w-full bg-gray-700/50 rounded-full h-3 overflow-hidden">
                                <div 
                                    className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-full transition-all duration-1000 ease-out shadow-lg shadow-red-900/20" 
                                    style={{ width: `${stat.percentage}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const SimplePieChart: React.FC<{ data: { name: string; value: number; color: string }[] }> = ({ data }) => {
    const total = data.reduce((acc, item) => acc + item.value, 0);
    let currentAngle = 0;

    if (total === 0) return null;

    if (data.length === 1) {
        return (
            <div className="relative w-48 h-48 mx-auto">
                <svg viewBox="-100 -100 200 200" className="w-full h-full">
                    <circle cx="0" cy="0" r="100" fill={data[0].color} />
                    <circle cx="0" cy="0" r="65" fill="#1f2937" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <span className="text-gray-400 text-xs font-medium">Gesamt</span>
                        <span className="text-white text-xl font-bold block">{total}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-48 h-48 mx-auto">
            <svg viewBox="-100 -100 200 200" className="w-full h-full transform -rotate-90">
                {data.map((item) => {
                    const percentage = item.value / total;
                    const angle = percentage * 360;
                    const largeArcFlag = angle > 180 ? 1 : 0;
                    const r = 100;
                    const startRad = (currentAngle * Math.PI) / 180;
                    const endRad = ((currentAngle + angle) * Math.PI) / 180;
                    const x1 = r * Math.cos(startRad);
                    const y1 = r * Math.sin(startRad);
                    const x2 = r * Math.cos(endRad);
                    const y2 = r * Math.sin(endRad);
                    const path = `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
                    currentAngle += angle;
                    return <path key={item.name} d={path} fill={item.color} stroke="#1f2937" strokeWidth="3" />;
                })}
                <circle cx="0" cy="0" r="65" fill="#1f2937" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                    <span className="text-gray-400 text-xs font-medium">Gesamt</span>
                    <span className="text-white text-xl font-bold block">{total}</span>
                </div>
            </div>
        </div>
    );
};

const OrganizationTypeChart: React.FC = () => {
    const [stats, setStats] = useState<(PartyStats & { color: string })[]>([]);
    const [loading, setLoading] = useState(true);

    const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9'];

    useEffect(() => {
        const controller = new AbortController();
        
        const fetchTypes = async () => {
            try {
                const params = new URLSearchParams();
                params.set('limit', '200');
                const result = await getList<Organization>('organizations', params, controller.signal);

                const counts = new Map<string, number>();
                let totalCount = 0;

                result.data.forEach(org => {
                    const type = org.organizationType || org.classification || 'Sonstige';
                    counts.set(type, (counts.get(type) || 0) + 1);
                    totalCount++;
                });

                if (totalCount === 0) {
                    setLoading(false);
                    return;
                }

                const sortedStats = Array.from(counts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([name, count], index) => ({
                        name,
                        count,
                        percentage: (count / totalCount) * 100,
                        color: COLORS[index % COLORS.length]
                    }));

                if (!controller.signal.aborted) {
                    setStats(sortedStats);
                    setLoading(false);
                }
            } catch (e) {
                if (e instanceof DOMException && e.name === 'AbortError') return;
                console.error("Failed to load org stats", e);
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        fetchTypes();
        return () => { controller.abort(); };
    }, []);

    if (loading) return <div className="h-40 flex items-center justify-center"><LoadingSpinner /></div>;
    if (stats.length === 0) return null;

    const chartData = stats.map(s => ({ name: s.name, value: s.count, color: s.color }));

    return (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
                <span className="mr-2">📊</span> Verteilung nach Typ
            </h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-10">
                <div className="flex-shrink-0">
                    <SimplePieChart data={chartData} />
                </div>
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {stats.map((stat, i) => (
                        <div key={i} className="flex items-center p-2 rounded hover:bg-gray-700/30 transition-colors">
                            <div className="w-3 h-3 rounded-full mr-3 flex-shrink-0 shadow-sm" style={{ backgroundColor: stat.color }}></div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline">
                                    <p className="text-sm font-medium text-gray-200 truncate" title={stat.name}>{stat.name}</p>
                                    <span className="text-xs text-gray-400 ml-2">{Math.round(stat.percentage)}%</span>
                                </div>
                                <p className="text-xs text-gray-500">{stat.count} Einträge</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const TrendingTopics: React.FC = () => {
    const [topics, setTopics] = useState<{ word: string, count: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const controller = new AbortController();
        
        const fetchAndAnalyze = async () => {
            try {
                const params = new URLSearchParams();
                params.set('limit', '100');
                params.set('sort', '-date');
                const result = await getList<Paper>('papers', params, controller.signal);

                const wordCounts = new Map<string, number>();

                result.data.forEach(paper => {
                    const text = paper.name.toLowerCase();
                    const words = text.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").split(/\s+/);
                    
                    words.forEach(word => {
                        if (word.length > 3 && !STOP_WORDS.has(word) && isNaN(Number(word))) {
                            wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
                        }
                    });
                });

                const sortedTopics = Array.from(wordCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([word, count]) => ({ 
                        word: word.charAt(0).toUpperCase() + word.slice(1), 
                        count 
                    }));

                if (!controller.signal.aborted) {
                    setTopics(sortedTopics);
                    setLoading(false);
                }
            } catch (e) {
                if (e instanceof DOMException && e.name === 'AbortError') return;
                console.error("Failed to analyze topics", e);
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        fetchAndAnalyze();
        return () => { controller.abort(); };
    }, []);

    const handleTopicClick = (word: string) => {
        navigate(`/papers?q=${encodeURIComponent(word)}`);
    };

    if (loading) return <div className="h-24 flex items-center justify-center"><LoadingSpinner /></div>;
    if (topics.length === 0) return null;

    return (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-5 mb-8">
             <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="mr-2">🏷️</span> Aktuelle Themen & Schlagwörter
            </h3>
            <div className="flex flex-wrap gap-2">
                {topics.map((topic, i) => (
                    <button
                        key={i}
                        onClick={() => handleTopicClick(topic.word)}
                        className="px-3 py-1.5 rounded-full bg-gray-700 hover:bg-indigo-600 text-gray-300 hover:text-white text-sm font-medium transition-colors border border-gray-600 hover:border-indigo-500 flex items-center"
                    >
                        {topic.word}
                        <span className="ml-2 text-xs opacity-60 bg-black/20 px-1.5 rounded-full">{topic.count}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

const PaperTypeChart: React.FC = () => {
    const [stats, setStats] = useState<PartyStats[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        
        const fetchPaperTypes = async () => {
            try {
                const params = new URLSearchParams();
                params.set('limit', '250');
                params.set('sort', '-date');
                
                const result = await getList<Paper>('papers', params, controller.signal);

                const counts = new Map<string, number>();
                let totalCount = 0;

                result.data.forEach(paper => {
                    const type = paper.paperType || 'Unbekannt';
                    counts.set(type, (counts.get(type) || 0) + 1);
                    totalCount++;
                });

                if (totalCount === 0) {
                    setLoading(false);
                    return;
                }

                const sortedStats = Array.from(counts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, count]) => ({
                        name,
                        count,
                        percentage: (count / totalCount) * 100
                    }));

                if (!controller.signal.aborted) {
                    setStats(sortedStats);
                    setLoading(false);
                }
            } catch (e) {
                if (e instanceof DOMException && e.name === 'AbortError') return;
                console.error("Failed to load paper stats", e);
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        fetchPaperTypes();
        return () => { controller.abort(); };
    }, []);

    if (loading) return <div className="h-40 flex items-center justify-center"><LoadingSpinner /></div>;
    if (stats.length === 0) return null;

    return (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-5 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="mr-2">📊</span> Verteilung nach Vorlagenart (Top 5)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                    {stats.slice(0, Math.ceil(stats.length / 2)).map((stat, i) => (
                        <DistributionBar key={i} stat={stat} />
                    ))}
                </div>
                <div className="space-y-3">
                    {stats.slice(Math.ceil(stats.length / 2)).map((stat, i) => (
                        <DistributionBar key={i} stat={stat} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const DistributionBar: React.FC<{ stat: PartyStats }> = ({ stat }) => (
    <div>
        <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-300">{stat.name}</span>
            <span className="text-gray-500">{stat.count}</span>
        </div>
        <div className="w-full bg-gray-700/50 rounded-full h-2 overflow-hidden">
            <div 
                className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full rounded-full" 
                style={{ width: `${Math.max(stat.percentage, 2)}%` }} 
            ></div>
        </div>
    </div>
);

const FavoritesList: React.FC = () => {
    const { favorites } = useFavorites();

    if (favorites.length === 0) return null;

    const getTypeIcon = (type: string) => {
        switch(type) {
            case 'meeting': return <CalendarDaysIcon />;
            case 'paper': return <DocumentTextIcon />;
            case 'person': return <UsersIcon />;
            case 'organization': return <BuildingLibraryIcon />;
            default: return <StarIconSolid />;
        }
    };

    return (
         <div className="bg-gray-800/50 border border-gray-700 rounded-lg mb-8">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center">
                    <span className="text-yellow-400 mr-2"><StarIconSolid /></span> Meine Merkliste
                </h2>
                <span className="bg-gray-700 text-gray-300 text-xs font-semibold px-2 py-1 rounded-full">{favorites.length}</span>
            </div>
            <ul className="divide-y divide-gray-700 max-h-80 overflow-y-auto">
                {favorites.map(item => (
                    <li key={item.id} className="p-4 hover:bg-gray-700/50 flex items-center group">
                        <div className="text-gray-400 mr-3">
                            {getTypeIcon(item.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <Link to={item.path} className="block font-medium text-gray-200 hover:text-white truncate">
                                {item.name}
                            </Link>
                            {item.info && <p className="text-xs text-gray-500">{item.info}</p>}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <FavoriteButton item={item} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const DateRangeFilter: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Derive state from URL params
    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const minDateParam = searchParams.get('minDate') || '';
    const maxDateParam = searchParams.get('maxDate') || '';

    // Local state for inputs, synced with URL-derived state
    const [minDate, setMinDate] = useState(minDateParam);
    const [maxDate, setMaxDate] = useState(maxDateParam);
    const [specificDate, setSpecificDate] = useState('');

    useEffect(() => {
        // This effect syncs the form state based on the URL params
        const urlMin = searchParams.get('minDate') || '';
        const urlMax = searchParams.get('maxDate') || '';
        
        if (urlMin && urlMin === urlMax) {
            // If it's a single-day filter, populate the specific date field
            setSpecificDate(urlMin);
            setMinDate('');
            setMaxDate('');
        } else {
            // Otherwise, populate the range fields
            setSpecificDate('');
            setMinDate(urlMin);
            setMaxDate(urlMax);
        }
    }, [searchParams]);

    const applyFilters = (e: React.FormEvent) => {
        e.preventDefault();
        const currentParams = new URLSearchParams(location.search);
        
        // Always clear old values first
        currentParams.delete('minDate');
        currentParams.delete('maxDate');

        if (specificDate) {
            // Set both min and max to the specific date for the API
            currentParams.set('minDate', specificDate);
            currentParams.set('maxDate', specificDate);
        } else {
            if (minDate) currentParams.set('minDate', minDate);
            else currentParams.delete('minDate'); // ensure removal if empty

            if (maxDate) currentParams.set('maxDate', maxDate);
            else currentParams.delete('maxDate'); // ensure removal if empty
        }
        
        currentParams.set('page', '1');
        navigate({ search: currentParams.toString() });
    };

    const clearFilters = () => {
        // Simply navigate to a URL without the date params
        const currentParams = new URLSearchParams(location.search);
        currentParams.delete('minDate');
        currentParams.delete('maxDate');
        currentParams.set('page', '1');
        navigate({ search: currentParams.toString() });
    };

    // Handlers to manage exclusivity of input fields
    const handleSpecificDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSpecificDate(e.target.value);
        setMinDate('');
        setMaxDate('');
    };

    const handleMinDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMinDate(e.target.value);
        setSpecificDate('');
    };
    
    const handleMaxDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMaxDate(e.target.value);
        setSpecificDate('');
    };

    const hasActiveFilters = minDateParam || maxDateParam;

    return (
        <form onSubmit={applyFilters} className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center">
                    <span className="mr-2">📅</span> Datum filtern
                </h3>
                {hasActiveFilters && (
                    <button 
                        type="button"
                        onClick={clearFilters}
                        className="text-xs text-red-400 hover:text-red-300 hover:underline"
                    >
                        Filter zurücksetzen
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-4 items-end">
                 {/* Specific date input */}
                <div className="flex flex-col space-y-1">
                    <label htmlFor="specificDate" className="text-xs text-gray-400">An einem bestimmten Tag</label>
                    <input 
                        type="date" 
                        id="specificDate"
                        value={specificDate}
                        onChange={handleSpecificDateChange}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-3 py-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                </div>

                {/* Separator */}
                <div className="text-gray-500 text-sm self-center pb-2">oder</div>

                {/* Range inputs */}
                <div className="flex flex-col space-y-1">
                    <label htmlFor="minDate" className="text-xs text-gray-400">Zeitraum (von)</label>
                    <input 
                        type="date" 
                        id="minDate"
                        value={minDate}
                        onChange={handleMinDateChange}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-3 py-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                </div>
                <div className="flex flex-col space-y-1">
                    <label htmlFor="maxDate" className="text-xs text-gray-400">(bis)</label>
                    <input 
                        type="date" 
                        id="maxDate"
                        value={maxDate}
                        onChange={handleMaxDateChange}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-3 py-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                </div>
                
                {/* Apply button */}
                <button 
                    type="submit"
                    className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-sm rounded-md transition-colors ml-auto"
                >
                    Anwenden
                </button>
            </div>
        </form>
    );
};

// Page Components
const Dashboard: React.FC = () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const { data: meetingsData, isLoading: meetingsLoading } = useOparlList<Meeting>('meetings', 
        useMemo(() => new URLSearchParams({ "sort": "start", "minDate": today, "limit": "15" }), [today])
    );
    const { data: papersData, isLoading: papersLoading } = useOparlList<Paper>('papers', 
        useMemo(() => new URLSearchParams({ "limit": "1" }), []) // Minimal fetch for count
    );
    const { favorites } = useFavorites();

    const upcomingMeetings = useMemo(() => {
        if (!meetingsData?.data) return [];
        const sorted = [...meetingsData.data].sort(sortMeetingsAsc);
        return sorted.slice(0, 5);
    }, [meetingsData]);

    return (
        <div>
            <PageTitle title="Dashboard" subtitle="Aktuelle Übersicht des Ratsinformationssystems der Stadt Köln" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card title="Sitzungen (Gesamt)" value={meetingsLoading ? '...' : meetingsData?.pagination.totalElements || 0} icon={<CalendarDaysIcon />} />
                <Card title="Vorlagen (Gesamt)" value={papersLoading ? '...' : papersData?.pagination.totalElements || 0} icon={<DocumentTextIcon />} />
                <Card title="Gemerkte Einträge" value={favorites.length} icon={<StarIconSolid />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="space-y-8">
                    <FavoritesList />

                    <div>
                        <h2 className="text-2xl font-bold text-white mb-4">Nächste Sitzungen</h2>
                        <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
                            {meetingsLoading ? <LoadingSpinner /> : (
                                <ul className="divide-y divide-gray-700">
                                    {upcomingMeetings.length > 0 ? upcomingMeetings.map(meeting => (
                                        <li key={meeting.id} className="p-4 hover:bg-gray-700/50">
                                            <div className="flex justify-between items-start">
                                                <Link to={`/meetings/${encodeUrl(meeting.id)}`} className="block flex-1">
                                                    <p className="font-semibold text-red-400">{meeting.name}</p>
                                                    <p className="text-sm text-gray-300">
                                                        {formatDateTime(meeting.start)}
                                                    </p>
                                                </Link>
                                                <FavoriteButton item={{ 
                                                    id: meeting.id, 
                                                    type: 'meeting', 
                                                    name: meeting.name, 
                                                    path: `/meetings/${encodeUrl(meeting.id)}`,
                                                    info: formatDateTime(meeting.start)
                                                }} className="ml-2" />
                                            </div>
                                        </li>
                                    )) : <p className="p-4 text-gray-400">Keine bevorstehenden Sitzungen gefunden.</p>}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                <div>
                    <h2 className="text-2xl font-bold text-white mb-4">Fraktions-Monitor 2025</h2>
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                        <PartyActivityChart year="2025" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const MeetingArchive: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const params = new URLSearchParams(location.search);
    const currentYear = parseInt(params.get('year') || new Date().getFullYear().toString(), 10);
    const currentMonth = parseInt(params.get('month') || '0', 10);
    const page = parseInt(params.get('page') || '1', 10);
    const query = params.get('q') || '';

    const [searchQuery, setSearchQuery] = useState(query);

    useEffect(() => {
        setSearchQuery(query);
    }, [query]);

    const apiParams = useMemo(() => {
        const p = new URLSearchParams();
        p.set('page', page.toString());
        p.set('sort', '-start'); 
        
        if (query) {
            p.set('q', query);
        }

        let minDate, maxDate;
        
        if (currentMonth > 0) {
            const yearStr = currentYear.toString();
            const monthStr = currentMonth.toString().padStart(2, '0');
            const lastDay = new Date(currentYear, currentMonth, 0).getDate();
            minDate = `${yearStr}-${monthStr}-01`;
            maxDate = `${yearStr}-${monthStr}-${lastDay}`;
        } else {
            minDate = `${currentYear}-01-01`;
            maxDate = `${currentYear}-12-31`;
        }

        p.set('minDate', minDate);
        p.set('maxDate', maxDate);
        
        return p;
    }, [currentYear, currentMonth, page, query]);

    const { data, isLoading, error } = useOparlList<Meeting>('meetings', apiParams);

    const sortedMeetings = useMemo(() => {
        if (!data?.data) return [];
        return [...data.data].sort(sortMeetingsDesc);
    }, [data]);

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newParams = new URLSearchParams(location.search);
        newParams.set('year', e.target.value);
        newParams.set('page', '1');
        navigate({ search: newParams.toString() });
    };

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newParams = new URLSearchParams(location.search);
        if (e.target.value === '0') newParams.delete('month');
        else newParams.set('month', e.target.value);
        newParams.set('page', '1');
        navigate({ search: newParams.toString() });
    };

    const handlePageChange = (newPage: number) => {
        const newParams = new URLSearchParams(location.search);
        newParams.set('page', newPage.toString());
        navigate({ search: newParams.toString() });
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newParams = new URLSearchParams(location.search);
        if (searchQuery.trim()) {
            newParams.set('q', searchQuery.trim());
        } else {
            newParams.delete('q');
        }
        newParams.set('page', '1');
        navigate({ search: newParams.toString() });
    };

    const years = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - i);
    const months = [
        'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];

    return (
        <div>
            <PageTitle title="Sitzungsarchiv" subtitle="Durchsuchen Sie vergangene Sitzungen nach Jahr und Monat" />

            <form onSubmit={handleSearchSubmit} className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-end">
                <div>
                    <label htmlFor="year-select" className="block text-gray-400 text-sm font-medium mb-1">Jahr:</label>
                    <select 
                        id="year-select"
                        value={currentYear} 
                        onChange={handleYearChange}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md focus:ring-red-500 focus:border-red-500 block p-2.5"
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                <div>
                    <label htmlFor="month-select" className="block text-gray-400 text-sm font-medium mb-1">Monat:</label>
                    <select 
                        id="month-select"
                        value={currentMonth} 
                        onChange={handleMonthChange}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md focus:ring-red-500 focus:border-red-500 block p-2.5"
                    >
                        <option value="0">Alle Monate</option>
                        {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                
                <div className="flex-grow min-w-[250px]">
                    <label htmlFor="archive-search" className="block text-gray-400 text-sm font-medium mb-1">Suche:</label>
                    <div className="flex">
                        <input
                            id="archive-search"
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Sitzungsname..."
                            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-l-md focus:ring-red-500 focus:border-red-500 block p-2.5 focus:z-10"
                        />
                        <button
                            type="submit"
                            className="px-4 py-2.5 bg-red-800 hover:bg-red-700 text-white text-sm rounded-r-md transition-colors -ml-px"
                        >
                            Suchen
                        </button>
                    </div>
                </div>
            </form>

            {error && <ErrorMessage message={error.message} />}

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-gray-300">
                        <thead className="bg-gray-700/50 text-gray-100">
                            <tr>
                                <th className="p-3">Name</th>
                                <th className="p-3 hidden md:table-cell whitespace-nowrap">Datum</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {isLoading && !data && <TableSkeleton columnClasses={['', 'hidden md:table-cell']} />}
                            
                            {sortedMeetings.map(item => (
                                <tr key={item.id} className="hover:bg-gray-700/50 border-b border-gray-700 last:border-0 group">
                                    <td className="p-3 font-medium relative pr-10">
                                        <Link to={`/meetings/${encodeUrl(item.id)}`} className="text-red-400 hover:underline block">{item.name}</Link>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <FavoriteButton item={{ 
                                                id: item.id, 
                                                type: 'meeting', 
                                                name: item.name, 
                                                path: `/meetings/${encodeUrl(item.id)}`,
                                                info: formatDateTime(item.start)
                                            }} />
                                        </div>
                                    </td>
                                    <td className="p-3 hidden md:table-cell whitespace-nowrap">{formatDateTime(item.start)}</td>
                                </tr>
                            ))}
                            
                            {!isLoading && data && data.data.length === 0 && (
                                <tr>
                                    <td colSpan={2} className="p-12 text-center text-gray-500">
                                        {query ? (
                                             <>
                                                <h3 className="text-xl font-medium text-white mb-2">Keine Ergebnisse für "{query}" gefunden</h3>
                                                <p>Versuchen Sie, Ihre Suche zu ändern oder die Filter anzupassen.</p>
                                            </>
                                        ) : (
                                            "Keine Sitzungen für diesen Zeitraum gefunden."
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {data && (
                <Pagination
                    currentPage={data.pagination.currentPage}
                    totalPages={data.pagination.totalPages}
                    onPageChange={handlePageChange}
                />
            )}
        </div>
    );
};

interface GenericListPageProps {
    resource: string;
    title?: string;
    subtitle?: string;
    searchPlaceholder?: string;
    searchParam?: string;
    renderItem: (item: any) => React.ReactNode;
    topContent?: React.ReactNode;
    columnClasses?: string[];
    sort?: string;
    baseParams?: URLSearchParams;
    sortItems?: (a: any, b: any) => number;
}

const GenericListPage: React.FC<GenericListPageProps> = ({ resource, title, subtitle, searchPlaceholder, searchParam = 'q', renderItem, topContent, columnClasses = [], sort, baseParams, sortItems }) => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Memoize params to ensure stable fetching
    const searchParams = useMemo(() => {
        const params = new URLSearchParams(location.search);
        if (!params.has('page')) params.set('page', '1');
        
        if (baseParams) {
            baseParams.forEach((value, key) => {
                // Don't overwrite if user is explicitly filtering date range in URL
                if ((key === 'minDate' || key === 'maxDate') && (params.has('minDate') || params.has('maxDate'))) {
                    return;
                }
                if (!params.has(key)) {
                    params.set(key, value);
                }
            });
        }

        if (sort && !params.has('sort')) {
            params.set('sort', sort);
        }

        return params;
    }, [location.search, sort, baseParams]);
    
    const query = searchParams.get(searchParam) || '';
    const [currentQuery, setCurrentQuery] = useState(query);

    // Sync local state if URL changes externally
    useEffect(() => {
        if (query !== currentQuery) {
            setCurrentQuery(query);
        }
    }, [query]);

    const { data, isLoading, error } = useOparlList<any>(resource, searchParams);

    const displayData = useMemo(() => {
        if (!data || !data.data) return [];
        const items = [...data.data];
        if (sortItems) {
            items.sort(sortItems);
        }
        return items;
    }, [data, sortItems]);

    const handlePageChange = (newPage: number) => {
        const newParams = new URLSearchParams(location.search);
        newParams.set('page', newPage.toString());
        navigate({ search: newParams.toString() });
    };
    
    const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const newParams = new URLSearchParams(location.search);
        if (currentQuery.trim()) {
            newParams.set(searchParam, currentQuery);
        } else {
            newParams.delete(searchParam);
        }
        newParams.set('page', '1');
        navigate({ search: newParams.toString() });
    };

    const clearSearch = () => {
        setCurrentQuery('');
        const newParams = new URLSearchParams(location.search);
        newParams.delete(searchParam);
        newParams.set('page', '1');
        navigate({ search: newParams.toString() });
    };

    const showSkeleton = isLoading && !data;

    const hasOtherFilters = useMemo(() => {
        const p = new URLSearchParams(searchParams);
        p.delete('page');
        p.delete(searchParam);
        p.delete('sort');
        return Array.from(p.keys()).length > 0;
    }, [searchParams, searchParam]);

    return (
        <div>
            {title && subtitle && <PageTitle title={title} subtitle={subtitle} />}
            
            {topContent}

            <form onSubmit={handleSearch} className="mb-6">
                <div className="flex">
                    <input
                        type="search"
                        value={currentQuery}
                        onChange={(e) => setCurrentQuery(e.target.value)}
                        placeholder={searchPlaceholder || "Suchen..."}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-l-md focus:ring-red-500 focus:border-red-500 text-white placeholder-gray-400"
                    />
                    <button type="submit" className="px-4 py-2 bg-red-700 text-white rounded-r-md hover:bg-red-600 font-medium">Suchen</button>
                </div>
            </form>

            {error && <ErrorMessage message={error.message} />}
            
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg shadow">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-gray-300">
                        <thead className="bg-gray-700/50 text-gray-100">
                            {renderItem("header")}
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {showSkeleton && <TableSkeleton columnClasses={columnClasses} />}
                            
                            {displayData.map(item => renderItem(item))}
                            
                            {!showSkeleton && data && data.data.length === 0 && (
                                <tr>
                                    <td colSpan={columnClasses.length || 1} className="p-12 text-center text-gray-500">
                                        {query || hasOtherFilters ? (
                                            <div>
                                                <h3 className="text-xl font-medium text-white mb-2">Keine Ergebnisse gefunden</h3>
                                                <div className="mb-4 max-w-md mx-auto">
                                                    {query && !hasOtherFilters && (
                                                        <p>Für Ihre Suche nach "{query}" wurden keine Einträge gefunden.</p>
                                                    )}
                                                    {query && hasOtherFilters && (
                                                        <p>Ihre Suche nach "{query}" in Kombination mit den aktiven Filtern lieferte keine Ergebnisse.</p>
                                                    )}
                                                    {!query && hasOtherFilters && (
                                                        <p>Für die ausgewählten Filterkriterien konnten keine Einträge gefunden werden.</p>
                                                    )}
                                                </div>
                                                <p className="text-sm mb-6">
                                                    Bitte versuchen Sie, Ihre Suchbegriffe zu ändern oder die Filter zurückzusetzen.
                                                </p>
                                                {query && (
                                                    <button 
                                                        onClick={clearSearch}
                                                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors font-medium"
                                                    >
                                                        Suche zurücksetzen
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            "Keine Einträge vorhanden."
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            {data && (
                <Pagination
                    currentPage={data.pagination.currentPage}
                    totalPages={data.pagination.totalPages}
                    onPageChange={handlePageChange}
                />
            )}
        </div>
    );
};

const MeetingDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const url = id ? decodeUrl(id) : undefined;
    const { data: meeting, isLoading, error } = useOparlItem<Meeting>(url);

    // Safe handling of embedded location vs URL location
    const locationUrl = (meeting?.location && typeof meeting.location === 'string') ? meeting.location : null;
    const { data: fetchedLocation } = useOparlItem<OparlLocation>(locationUrl);
    
    const locationData = (meeting?.location && typeof meeting.location === 'object') 
        ? (meeting.location as unknown as OparlLocation) 
        : fetchedLocation;
    
    const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
    const [consultations, setConsultations] = useState<Consultation[]>([]);
    const [papers, setPapers] = useState<Paper[]>([]);
    const [relatedItemsLoading, setRelatedItemsLoading] = useState(false);

    const [aiSummary, setAiSummary] = useState<string | undefined>(undefined);
    const [aiLoading, setAiLoading] = useState(false);

    const handleAnalyzeMeeting = async () => {
        if (!meeting) return;
        setAiLoading(true);
        
        const itemsList = agendaItems.map((i, idx) => `${idx + 1}. ${i.name} (${i.public ? 'Öffentlich' : 'Nicht öffentlich'})`).join('\n');
        const prompt = `Du bist ein hilfreicher Assistent für Bürger, die sich über Kommunalpolitik informieren.
        
        Analysiere die folgende Sitzung:
        Titel: ${meeting.name}
        Datum: ${formatDateTime(meeting.start)}
        
        Tagesordnungspunkte:
        ${itemsList.substring(0, 5000)} (Liste gekürzt falls zu lang)
        
        Aufgabe:
        Fasse die wichtigsten Themen dieser Sitzung kurz und verständlich zusammen. Hebe Punkte hervor, die für Bürger besonders interessant sein könnten.`;

        const result = await askGemini(prompt);
        setAiSummary(result);
        setAiLoading(false);
    };

    useEffect(() => {
        const controller = new AbortController();

        if (meeting) {
            const fetchRelated = async () => {
                setRelatedItemsLoading(true);
                try {
                    const items = meeting.agendaItem || [];
                    // Handle both embedded agenda items and URLs (though usually agendaItem is array of objects)
                    const agendaPromises = items.map(item => {
                        if (!item.id) return Promise.resolve(item);
                         // If it's a string/URL (rare for agendaItem in OParl strict, but possible)
                         // If it's an object with ID, we can treat it as loaded or fetch fresh. 
                         // Usually in OParl agendaItem is embedded. We'll assume if it has name/number it's good.
                        return Promise.resolve(item);
                    });
                    
                    const resolvedAgendaItems = (await Promise.all(agendaPromises)).filter(Boolean);
                    if (controller.signal.aborted) return;
                    
                    // Fetch consultations to link papers
                    // AgendaItem.consultation can be string or object
                    const consultationPromises = resolvedAgendaItems.map(item => {
                        if (!item.consultation) return Promise.resolve(null as unknown as Consultation);
                        if (typeof item.consultation === 'object') return Promise.resolve(item.consultation as unknown as Consultation);
                        return getItem<Consultation>(item.consultation, controller.signal);
                    });

                    const resolvedConsultations = (await Promise.all(consultationPromises)).filter(Boolean);
                    if (controller.signal.aborted) return;

                    // Fetch related papers
                    const paperPromises = resolvedConsultations.map(c => {
                        if (!c.paper) return Promise.resolve(null as unknown as Paper);
                        if (typeof c.paper === 'object') return Promise.resolve(c.paper as unknown as Paper);
                        return getItem<Paper>(c.paper, controller.signal);
                    });
                    const resolvedPapers = (await Promise.all(paperPromises)).filter(Boolean);

                    if (!controller.signal.aborted) {
                        setAgendaItems(resolvedAgendaItems);
                        setConsultations(resolvedConsultations);
                        setPapers(resolvedPapers);
                        setRelatedItemsLoading(false);
                    }
                } catch (err) {
                    if (err instanceof DOMException && err.name === 'AbortError') return;
                    console.error("Failed to fetch related items", err);
                    if (!controller.signal.aborted) setRelatedItemsLoading(false);
                }
            };
            fetchRelated();
        }
        return () => { controller.abort(); };
    }, [meeting]);

    if (isLoading) return <LoadingSpinner />;
    if (error) return <ErrorMessage message={error.message} />;
    if (!meeting) return <ErrorMessage message="Sitzung nicht gefunden." />;

    return (
        <div>
            <PageTitle 
                title={meeting.name} 
                subtitle={`Sitzung vom ${formatDateTime(meeting.start)}`} 
                actions={
                    <FavoriteButton item={{ 
                        id: meeting.id, 
                        type: 'meeting', 
                        name: meeting.name, 
                        path: `/meetings/${encodeUrl(meeting.id)}`,
                        info: formatDateTime(meeting.start)
                    }} />
                }
            />
            
            <GeminiCard 
                title="Sitzungsanalyse mit Gemini"
                content={aiSummary}
                isLoading={aiLoading}
                onAction={handleAnalyzeMeeting}
                actionLabel="Agenda zusammenfassen"
            />

            <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-lg">
                <DetailSection title="Metadaten">
                    <dl>
                        <DetailItem label="Startzeit">{formatDateTime(meeting.start)}</DetailItem>
                        <DetailItem label="Endzeit">{meeting.end ? formatDateTime(meeting.end) : 'N/A'}</DetailItem>
                        <DetailItem label="Ort">{locationData?.description || 'N/A'}</DetailItem>
                        <DetailItem label="Erstellt">{formatDateTime(meeting.created)}</DetailItem>
                    </dl>
                </DetailSection>

                <DetailSection title="Tagesordnung">
                    {relatedItemsLoading ? <LoadingSpinner /> : (
                        <ul className="space-y-4">
                            {agendaItems.length > 0 ? agendaItems.map((item, idx) => (
                                <li key={item.id || idx} className="p-3 bg-gray-700/50 rounded-md">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                        <p className="font-semibold text-gray-200">{item.number} {item.name}</p>
                                        {papers.find(p => consultations.find(c => {
                                            // Handle both string/object IDs for comparison if necessary, 
                                            // but here we rely on reference equality or fetching ensuring ID presence
                                            const cId = typeof item.consultation === 'object' ? item.consultation.id : item.consultation;
                                            return c.id === cId;
                                        })?.paper === p.id) && (
                                            <Link
                                                to={`/papers/${encodeUrl(papers.find(p => {
                                                    const cons = consultations.find(c => {
                                                        const cId = typeof item.consultation === 'object' ? item.consultation.id : item.consultation;
                                                        return c.id === cId;
                                                    });
                                                    if (!cons) return false;
                                                    const pId = typeof cons.paper === 'object' ? cons.paper.id : cons.paper;
                                                    return p.id === pId;
                                                })!.id)}`}
                                                className="text-sm text-red-400 hover:text-red-300 hover:underline inline-flex items-center flex-shrink-0"
                                            >
                                                <LinkIcon /> <span className="ml-1">Zur Vorlage</span>
                                            </Link>
                                        )}
                                    </div>
                                </li>
                            )) : <p className="text-gray-400 italic">Keine Tagesordnungspunkte verfügbar.</p>}
                        </ul>
                    )}
                </DetailSection>
            </div>
        </div>
    );
};

const PaperDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const url = id ? decodeUrl(id) : undefined;
    const { data: paper, isLoading, error } = useOparlItem<Paper>(url);

    const [aiSummary, setAiSummary] = useState<string | undefined>(undefined);
    const [aiLoading, setAiLoading] = useState(false);

    const handleExplainPaper = async () => {
        if (!paper) return;
        setAiLoading(true);
        
        const files: Attachment[] = [];
        if (paper.mainFile) {
             files.push({ url: paper.mainFile.downloadUrl || paper.mainFile.accessUrl, mimeType: paper.mainFile.mimeType });
        }
        if (paper.auxiliaryFile) {
            paper.auxiliaryFile.forEach(f => {
                 files.push({ url: f.downloadUrl || f.accessUrl, mimeType: f.mimeType });
            });
        }

        const prompt = `Erkläre die folgende Ratsvorlage in einfacher Sprache für einen Bürger:
        
        Titel: ${paper.name}
        Referenznummer: ${paper.reference}
        Typ: ${paper.paperType}
        Datum: ${paper.date}
        
        Bitte analysiere auch die angehängten Dokumente (falls vorhanden und lesbar), um den Inhalt präzise wiederzugeben.
        Fasse zusammen, worum es geht, welche Entscheidungen getroffen werden sollen und warum das wichtig ist.`;

        const result = await askGemini(prompt, files);
        setAiSummary(result);
        setAiLoading(false);
    };

    if (isLoading) return <LoadingSpinner />;
    if (error) return <ErrorMessage message={error.message} />;
    if (!paper) return <ErrorMessage message="Vorlage nicht gefunden." />;

    return (
        <div>
            <PageTitle 
                title={paper.name} 
                subtitle={`Vorlage ${paper.reference}`} 
                actions={
                    <FavoriteButton item={{ 
                        id: paper.id, 
                        type: 'paper', 
                        name: paper.name, 
                        path: `/papers/${encodeUrl(paper.id)}`,
                        info: paper.paperType
                    }} />
                }
            />
            
            <GeminiCard 
                title="Vorlage erklären mit Gemini"
                content={aiSummary}
                isLoading={aiLoading}
                onAction={handleExplainPaper}
                actionLabel="Inhalt und Dokumente analysieren"
            />

             <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-lg">
                <DetailSection title="Metadaten">
                    <dl>
                        <DetailItem label="Referenz">{paper.reference}</DetailItem>
                        <DetailItem label="Datum">{formatDateTime(paper.date)}</DetailItem>
                        <DetailItem label="Typ">{paper.paperType || 'N/A'}</DetailItem>
                        <DetailItem label="Erstellt">{formatDateTime(paper.created)}</DetailItem>
                    </dl>
                </DetailSection>

                <DetailSection title="Dateien">
                    <ul className="space-y-2">
                        {paper.mainFile && <li><DownloadLink file={paper.mainFile} /> (Hauptdokument)</li>}
                        {paper.auxiliaryFile?.map(file => (
                            <li key={file.id}><DownloadLink file={file} /></li>
                        ))}
                        {!paper.mainFile && (!paper.auxiliaryFile || paper.auxiliaryFile.length === 0) && (
                             <li className="text-gray-400 italic">Keine Dateien verfügbar.</li>
                        )}
                    </ul>
                </DetailSection>
            </div>
        </div>
    );
};

// --- Papers Page Components ---
const PapersByTopicView: React.FC = () => {
    const [groupedPapers, setGroupedPapers] = useState<Map<string, Paper[]>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const fetchAndGroupPapers = async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams();
                params.set('limit', '250'); // Fetch more papers for better grouping
                params.set('sort', '-date');
                const result = await getList<Paper>('papers', params, controller.signal);

                if (controller.signal.aborted) return;

                const wordCounts = new Map<string, Paper[]>();

                result.data.forEach(paper => {
                    const text = paper.name.toLowerCase();
                    const words = text.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").split(/\s+/);
                    
                    const uniqueWords = new Set<string>();
                    words.forEach(word => {
                        if (word.length > 3 && !STOP_WORDS.has(word) && isNaN(Number(word))) {
                            uniqueWords.add(word);
                        }
                    });

                    uniqueWords.forEach(word => {
                        const existing = wordCounts.get(word) || [];
                        wordCounts.set(word, [...existing, paper]);
                    });
                });

                const filteredGroups = new Map<string, Paper[]>();
                for (const [word, papers] of wordCounts.entries()) {
                    if (papers.length > 1) { // Only show topics with more than one paper
                        const capitalizedWord = word.charAt(0).toUpperCase() + word.slice(1);
                        filteredGroups.set(capitalizedWord, papers);
                    }
                }
                
                const sortedGroups = new Map([...filteredGroups.entries()].sort((a, b) => b[1].length - a[1].length));

                if (!controller.signal.aborted) {
                    setGroupedPapers(sortedGroups);
                    setLoading(false);
                }

            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.error("Failed to group papers by topic", err);
                if (!controller.signal.aborted) {
                    setError("Daten konnten nicht geladen und gruppiert werden.");
                    setLoading(false);
                }
            }
        };

        fetchAndGroupPapers();

        return () => controller.abort();
    }, []);

    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorMessage message={error} />;

    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-4">
                Vorlagen gruppiert nach gemeinsamen Schlagwörtern aus den Titeln (basierend auf den letzten 250 Einträgen).
            </p>
            {groupedPapers.size === 0 && !loading && (
                <p className="text-gray-500 text-center py-8">Keine Themengruppen gefunden.</p>
            )}
            <div className="space-y-2">
                {Array.from(groupedPapers.entries()).map(([topic, papers]) => (
                    <details key={topic} className="bg-gray-700/50 rounded-lg group">
                        <summary className="p-3 flex justify-between items-center cursor-pointer list-none hover:bg-gray-700/80 rounded-t-lg group-open:rounded-b-none transition-colors">
                            <span className="font-semibold text-red-400">{topic}</span>
                            <div className="flex items-center">
                                <span className="text-sm text-gray-400 mr-3 bg-gray-600 px-2 py-0.5 rounded-full">{papers.length} Vorlagen</span>
                                <svg className="w-5 h-5 text-gray-400 transition-transform transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </summary>
                        <div className="border-t border-gray-600 p-3">
                            <ul className="space-y-2">
                                {papers.map(paper => (
                                    <li key={paper.id} className="text-sm">
                                        <Link to={`/papers/${encodeUrl(paper.id)}`} className="text-gray-300 hover:text-white hover:underline flex items-start">
                                            <span className="text-gray-500 mr-2 mt-0.5">&#8227;</span>
                                            <div>
                                                <span>{paper.name}</span>
                                                <span className="block text-xs text-gray-500">{formatDateTime(paper.date)}</span>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </details>
                ))}
            </div>
        </div>
    );
};

const PapersListView: React.FC = () => (
    <GenericListPage
        resource="papers"
        sort="-date"
        searchPlaceholder="Nach Vorlagen suchen..."
        columnClasses={['', 'hidden sm:table-cell', 'hidden md:table-cell', 'hidden lg:table-cell']} 
        renderItem={(item: Paper | "header") => {
            if (item === "header") return (
                <tr>
                    <th className="p-3 text-left">Betreff</th>
                    <th className="p-3 text-left hidden sm:table-cell">Typ</th>
                    <th className="p-3 text-left hidden md:table-cell">Datum</th>
                    <th className="p-3 text-left hidden lg:table-cell">Referenz</th>
                </tr>
            );
            return (
                <tr key={item.id} className="border-b border-gray-700 last:border-0 transition-all duration-300 hover:bg-gray-700/60 hover:shadow-lg hover:z-10 relative group">
                    <td className="p-3 relative pr-10">
                        <Link to={`/papers/${encodeUrl(item.id)}`} className="font-medium text-red-400 hover:text-red-300 hover:underline block mb-1 transition-colors">
                            {item.name}
                        </Link>
                        <div className="sm:hidden text-xs text-gray-400 flex flex-wrap gap-2">
                            {item.paperType && <span className="bg-gray-700 px-1.5 py-0.5 rounded">{item.paperType}</span>}
                            <span>{formatDateTime(item.date)}</span>
                        </div>
                         <div className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                            <FavoriteButton item={{ 
                                id: item.id, 
                                type: 'paper', 
                                name: item.name, 
                                path: `/papers/${encodeUrl(item.id)}`,
                                info: item.paperType
                            }} />
                        </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell text-gray-300 text-sm">
                        {item.paperType || '-'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-gray-300 text-sm whitespace-nowrap">
                        {formatDateTime(item.date)}
                    </td>
                    <td className="p-3 hidden lg:table-cell text-gray-400 text-sm font-mono">
                        {item.reference || '-'}
                    </td>
                </tr>
            );
        }} 
    />
);

const PapersPage: React.FC = () => {
    const [viewMode, setViewMode] = useState<'list' | 'topic'>('list');

    return (
        <div>
            <PageTitle title="Vorlagen" subtitle="Durchsuchen und entdecken Sie alle öffentlichen Vorlagen" />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TrendingTopics />
                <PaperTypeChart />
            </div>

            <div className="flex border-b border-gray-700 mt-8 mb-6">
                <button
                    onClick={() => setViewMode('list')}
                    className={`px-4 py-2 -mb-px text-sm font-medium transition-colors ${
                        viewMode === 'list' 
                            ? 'border-b-2 border-red-500 text-white' 
                            : 'text-gray-400 hover:text-white border-b-2 border-transparent'
                    }`}
                >
                    Listenansicht
                </button>
                <button
                    onClick={() => setViewMode('topic')}
                    className={`px-4 py-2 -mb-px text-sm font-medium transition-colors ${
                        viewMode === 'topic' 
                            ? 'border-b-2 border-red-500 text-white' 
                            : 'text-gray-400 hover:text-white border-b-2 border-transparent'
                    }`}
                >
                    Themenansicht
                </button>
            </div>

            {viewMode === 'list' ? <PapersListView /> : <PapersByTopicView />}
        </div>
    );
};


const App: React.FC = () => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return (
    <Router initialEntries={['/']}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meetings" element={<GenericListPage
            resource="meetings"
            sort="start"
            sortItems={sortMeetingsAsc}
            baseParams={new URLSearchParams({ "minDate": todayStr })}
            title="Aktuelle Sitzungen"
            subtitle="Liste der bevorstehenden öffentlichen Sitzungen"
            topContent={<DateRangeFilter />}
            searchPlaceholder="Nach Sitzungen suchen..."
            columnClasses={['', 'hidden md:table-cell']} 
            renderItem={(item: Meeting | "header") => {
                if (item === "header") return <tr><th className="p-3">Name</th><th className="p-3 hidden md:table-cell whitespace-nowrap">Datum</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-gray-700/50 border-b border-gray-700 last:border-0 group">
                        <td className="p-3 font-medium relative pr-10">
                            <Link to={`/meetings/${encodeUrl(item.id)}`} className="text-red-400 hover:underline block">{item.name}</Link>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ 
                                    id: item.id, 
                                    type: 'meeting', 
                                    name: item.name, 
                                    path: `/meetings/${encodeUrl(item.id)}`,
                                    info: formatDateTime(item.start)
                                }} />
                            </div>
                        </td>
                        <td className="p-3 hidden md:table-cell whitespace-nowrap">{formatDateTime(item.start)}</td>
                    </tr>
                );
            }} />} />
            <Route path="/meetings/:id" element={<MeetingDetailPage />} />
            <Route path="/archive" element={<MeetingArchive />} />

          <Route path="/papers" element={<PapersPage />} />
          <Route path="/papers/:id" element={<PaperDetailPage />} />

          <Route path="/people" element={<GenericListPage
            resource="people"
            title="Personen"
            subtitle="Liste aller im Ratsinformationssystem erfassten Personen"
            searchPlaceholder="Nach Personen suchen..."
            columnClasses={['', 'hidden sm:table-cell']} 
            renderItem={(item: Person | "header") => {
                if (item === "header") return <tr><th className="p-3">Name</th><th className="p-3 hidden sm:table-cell">Anrede</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-gray-700/50 border-b border-gray-700 last:border-0 group">
                        <td className="p-3 font-medium relative pr-10">
                            {item.name}
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ 
                                    id: item.id, 
                                    type: 'person', 
                                    name: item.name, 
                                    path: `/people`,
                                    info: item.formOfAddress
                                }} />
                            </div>
                        </td>
                        <td className="p-3 hidden sm:table-cell">{item.formOfAddress}</td>
                    </tr>
                );
            }} />} />
          <Route path="/organizations" element={<GenericListPage
            resource="organizations"
            title="Gremien"
            subtitle="Liste aller Gremien wie Ausschüsse, Räte und Fraktionen"
            topContent={<OrganizationTypeChart />}
            searchPlaceholder="Nach Gremien suchen..."
            searchParam="name"
            columnClasses={['', 'hidden md:table-cell', 'hidden sm:table-cell']}
            renderItem={(item: Organization | "header") => {
                if (item === "header") return <tr><th className="p-3">Name</th><th className="p-3 hidden md:table-cell">Typ</th><th className="p-3 hidden sm:table-cell">Klassifikation</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-gray-700/50 border-b border-gray-700 last:border-0 group">
                        <td className="p-3 font-medium relative pr-10">
                            {item.name}
                             <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ 
                                    id: item.id, 
                                    type: 'organization', 
                                    name: item.name, 
                                    path: `/organizations`,
                                    info: item.organizationType
                                }} />
                            </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">{item.organizationType}</td>
                        <td className="p-3 hidden sm:table-cell">{item.classification}</td>
                    </tr>
                );
            }} />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;