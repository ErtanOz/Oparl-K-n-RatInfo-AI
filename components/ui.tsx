
import React from 'react';
import { Link } from 'react-router-dom';
import { useFavorites, FavoriteItem } from '../hooks/useFavorites';

export const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-red-500"></div>
  </div>
);

interface ErrorMessageProps {
  message: string;
}
export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => (
  <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-md" role="alert">
    <strong className="font-bold">Fehler: </strong>
    <span className="block sm:inline">{message}</span>
  </div>
);

interface CardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}
export const Card: React.FC<CardProps> = ({ title, value, icon }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 shadow-lg">
    <div className="flex items-center">
      <div className="p-3 rounded-full bg-red-800/50 text-white">{icon}</div>
      <div className="ml-4">
        <p className="text-sm font-medium text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ columnClasses: string[], rowCount?: number }> = ({ columnClasses, rowCount = 10 }) => (
    <>
        {Array.from({ length: rowCount }).map((_, rIdx) => (
            <tr key={rIdx} className="border-b border-gray-700 last:border-0 animate-pulse">
                {columnClasses.map((cls, cIdx) => (
                    <td key={cIdx} className={`p-3 align-middle ${cls}`}>
                        <div 
                            className="h-4 bg-gray-700/50 rounded" 
                            style={{ width: (rIdx + cIdx) % 3 === 0 ? '60%' : (rIdx + cIdx) % 3 === 1 ? '80%' : '40%' }}
                        ></div>
                        {(rIdx + cIdx) % 5 === 0 && cIdx === 0 && (
                            <div className="h-3 bg-gray-700/30 rounded w-1/3 mt-2 sm:hidden"></div>
                        )}
                    </td>
                ))}
            </tr>
        ))}
    </>
);

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}
export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    return (
        <div className="flex justify-center items-center space-x-2 mt-6">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
            >
                Zurück
            </button>
            <span className="text-gray-400">
                Seite {currentPage} von {totalPages}
            </span>
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
            >
                Weiter
            </button>
        </div>
    );
};

export const FavoriteButton: React.FC<{ item: FavoriteItem, className?: string }> = ({ item, className = "" }) => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const active = isFavorite(item.id);

    return (
        <button 
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite(item);
            }}
            className={`p-2 rounded-full transition-all hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-yellow-500 ${active ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'} ${className}`}
            title={active ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
            aria-label={active ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
        >
            {active ? <StarIconSolid /> : <StarIconOutline />}
        </button>
    );
};

export const PageTitle: React.FC<{ title: string, subtitle: string, actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
    <div className="mb-6 flex justify-between items-start">
        <div>
            <h1 className="text-3xl font-bold text-white">{title}</h1>
            <p className="text-gray-400 mt-1">{subtitle}</p>
        </div>
        {actions && (
            <div className="ml-4 flex-shrink-0">
                {actions}
            </div>
        )}
    </div>
);

export const DetailSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-6">
        <h3 className="text-xl font-semibold text-red-400 border-b-2 border-gray-700 pb-2 mb-3">{title}</h3>
        {children}
    </div>
);

export const DetailItem: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
     <div className="grid grid-cols-1 md:grid-cols-4 py-2">
        <dt className="font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 md:mt-0 md:col-span-3 text-gray-200">{children || 'N/A'}</dd>
    </div>
);

export const DownloadLink: React.FC<{ file: import('../types').File }> = ({ file }) => (
  <a
    href={file.accessUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center text-red-400 hover:text-red-300 hover:underline"
  >
    <PaperClipIcon />
    <span className="ml-2">{file.name} ({file.mimeType})</span>
  </a>
);

// --- Simple Markdown Renderer ---

const formatInline = (text: string): React.ReactNode[] => {
    // Simple parser for **bold** text
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="font-bold text-white">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let listBuffer: string[] = [];

    const flushList = (keyIndex: number) => {
        if (listBuffer.length > 0) {
            elements.push(
                <ul key={`list-${keyIndex}`} className="list-disc pl-5 mb-4 text-gray-300 space-y-1 marker:text-indigo-400">
                    {listBuffer.map((item, i) => (
                        <li key={i} className="pl-1">{formatInline(item)}</li>
                    ))}
                </ul>
            );
            listBuffer = [];
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // Handle Lists
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            listBuffer.push(trimmed.substring(2));
            return;
        }
        
        // If not a list item, flush any pending list
        flushList(index);

        // Handle Headers
        if (trimmed.startsWith('### ')) {
            elements.push(<h3 key={index} className="text-lg font-bold text-indigo-400 mt-6 mb-2">{formatInline(trimmed.substring(4))}</h3>);
        } else if (trimmed.startsWith('## ')) {
            elements.push(<h2 key={index} className="text-xl font-bold text-indigo-300 mt-8 mb-3 border-b border-indigo-500/30 pb-1">{formatInline(trimmed.substring(3))}</h2>);
        } else if (trimmed.startsWith('# ')) {
            elements.push(<h1 key={index} className="text-2xl font-bold text-white mt-8 mb-4">{formatInline(trimmed.substring(2))}</h1>);
        } 
        // Handle Empty Lines (ignore for rendering, essentially paragraph breaks)
        else if (trimmed === '') {
            return;
        }
        // Handle Paragraphs
        else {
            elements.push(<p key={index} className="mb-3 text-gray-300 leading-relaxed">{formatInline(trimmed)}</p>);
        }
    });

    // Final flush in case text ends with a list
    flushList(lines.length);

    return <div>{elements}</div>;
};

export const GeminiCard: React.FC<{ title: string, content?: string, isLoading: boolean, onAction: () => void, actionLabel: string }> = ({ title, content, isLoading, onAction, actionLabel }) => (
    <div className="bg-gray-800/80 border border-indigo-500/50 rounded-lg p-6 shadow-lg shadow-indigo-500/10 relative overflow-hidden my-6">
        <div className="absolute top-0 right-0 p-2 opacity-10 text-indigo-400">
            <SparklesIcon />
        </div>
        <div className="flex items-center gap-2 mb-4 text-indigo-400">
            <SparklesIcon />
            <h3 className="font-bold text-lg">{title}</h3>
        </div>
        
        {content ? (
            <div className="bg-gray-900/50 p-5 rounded border border-gray-700">
                <MarkdownRenderer content={content} />
            </div>
        ) : (
             <p className="text-gray-400 text-sm mb-4">Nutzen Sie Gemini AI, um diese Inhalte zu analysieren und zusammenzufassen.</p>
        )}

        {!content && (
            <button 
                onClick={onAction} 
                disabled={isLoading}
                className="mt-4 flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors disabled:opacity-50 font-medium text-sm"
            >
                {isLoading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div> : null}
                <span>{isLoading ? 'Analysiere...' : actionLabel}</span>
            </button>
        )}
    </div>
);


// Icons
export const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
export const CalendarDaysIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
export const DocumentTextIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
export const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197m0 0A5.975 5.975 0 0112 13a5.975 5.975 0 013 5.197M15 21a6 6 0 00-9-5.197" /></svg>
export const BuildingLibraryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>
export const LinkIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
export const PaperClipIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
export const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
export const StarIconOutline = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
export const StarIconSolid = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
export const ArchiveBoxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
