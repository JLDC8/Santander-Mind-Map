
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';

// --- DEFINICIONES DE TIPOS ---
type LinkType = 'web' | 'outlook' | 'excel' | 'powerpoint' | 'teams' | 'image';
type Priority = 0 | 1 | 2 | 3;
type ViewMode = 'map' | 'list';

interface Link {
  id: number;
  url: string;
  title: string;
  type: LinkType;
  desktopUrl?: string;
  imageData?: string; // For base64 image data
}

interface Subtask {
  id: number;
  text: string;
  completed: boolean;
  isEditing: boolean;
  ownerIds: number[];
}

interface Owner {
    id: number;
    name: string;
    imageUrl: string;
    teamsUrl: string;
}

interface Meeting {
    id: number;
    title: string;
    time: string;
    url: string;
    notes: string;
}

interface Node {
  id: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: number | null;
  links: Link[];
  notes: string;
  subtasks: Subtask[];
  tags: string[];
  ownerIds: number[];
  priority: Priority;
  meetingIds: number[];
  isEditing?: boolean;
}

interface AddLinkModalState {
  isOpen: boolean;
  nodeId: number | null;
}

interface AddImageModalState {
  isOpen: boolean;
  nodeId: number | null;
}

// --- CONSTANTES ---
const BASE_NODE_HEIGHT = 60;
const SUBTASK_HEIGHT = 28;
const METADATA_ROW_HEIGHT = 40; // Fila unificada para owners y tags
const LINK_ROW_EXTRA_HEIGHT = 35; // Altura extra si hay una fila de enlaces

const PRIORITY_STYLES: { [key in Priority]: { bg: string; text: string; label: string } } = {
    0: { bg: 'bg-gray-200', text: 'text-gray-500', label: 'Ninguna' },
    1: { bg: 'bg-red-500', text: 'text-white', label: 'P1' },
    2: { bg: 'bg-yellow-400', text: 'text-white', label: 'P2' },
    3: { bg: 'bg-green-500', text: 'text-white', label: 'P3' },
};


// --- ALGORITMO DE DISEÑO (Izquierda a Derecha) ---
const H_SPACE = 120; // Espacio horizontal entre niveles
const V_SPACE = 20;  // Espacio vertical entre subárboles de hermanos

const layoutTree = (nodes: Node[]): Node[] => {
    if (nodes.length === 0) return [];

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const childrenMap = new Map<number | null, Node[]>();
    nodes.forEach(n => childrenMap.set(n.id, []));
    nodes.forEach(n => {
        if (n.parentId !== null && childrenMap.has(n.parentId)) {
            childrenMap.get(n.parentId)!.push(n);
        }
    });

    const positionedNodes = new Map<number, { x: number, y: number }>();
    const subtreeHeights = new Map<number, number>();

    const calculateHeights = (node: Node) => {
        const children = childrenMap.get(node.id) || [];
        if (children.length === 0) {
            subtreeHeights.set(node.id, node.height);
            return;
        }

        children.forEach(calculateHeights);
        
        const childrenHeight = children.reduce((acc, child) => acc + subtreeHeights.get(child.id)!, 0);
        const totalHeight = childrenHeight + (children.length - 1) * V_SPACE;
        subtreeHeights.set(node.id, Math.max(totalHeight, node.height));
    };

    const setPositions = (node: Node, x: number, y: number) => {
        const myHeight = subtreeHeights.get(node.id)!;
        const children = childrenMap.get(node.id) || [];
        
        positionedNodes.set(node.id, { x, y: y + (myHeight - node.height) / 2 });

        let currentY = y;
        for (const child of children) {
            setPositions(child, x + node.width + H_SPACE, currentY);
            currentY += subtreeHeights.get(child.id)! + V_SPACE;
        }
    };
    
    const roots = nodes.filter(n => n.parentId === null);
    roots.forEach(calculateHeights);

    let currentRootY = 50;
    for (const root of roots) {
        setPositions(root, 50, currentRootY);
        currentRootY += subtreeHeights.get(root.id)! + V_SPACE * 2;
    }

    return nodes.map(node => {
        const pos = positionedNodes.get(node.id);
        return pos ? { ...node, x: pos.x, y: pos.y } : node;
    });
};


// --- ICONOS SVG ---
const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);
const OutlookIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5"><path fill="#0072c6" d="M36 4H12a4 4 0 00-4 4v32a4 4 0 004 4h24a4 4 0 004-4V8a4 4 0 00-4-4z" /><path fill="#fff" d="M32 12L18 23v-6l-4 3v10l4 3v-6l14 11V12z" /></svg>);
const ExcelIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5"><path fill="#169154" d="M36 4H12a4 4 0 00-4 4v32a4 4 0 004 4h24a4 4 0 004-4V8a4 4 0 00-4-4z" /><path fill="#fff" d="M22 32l-6-6-6 6h12zm-6-8l6-6H16l-6 6h6z" /><path fill="#fff" d="M29 16l6 6-6 6v-4h-6v-4h6v-4z" /></svg>);
const PowerPointIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5"><path fill="#d24726" d="M36 4H12a4 4 0 00-4 4v32a4 4 0 004 4h24a4 4 0 004-4V8a4 4 0 00-4-4z" /><path fill="#fff" d="M16 14h14v6h-6v14h-8V20h-4v-6z" /></svg>);
const TeamsIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5"><path fill="#4f52b2" d="M36 4H12a4 4 0 00-4 4v32a4 4 0 004 4h24a4 4 0 004-4V8a4 4 0 00-4-4z" /><path fill="#fff" d="M19 14h-6v18h6v-8h8v-4h-8v-6z" /><circle cx="31" cy="23" r="7" fill="#fff" /><path fill="#4f52b2" d="M31 18c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" /></svg>);
const WebIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-500"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>);
const AddIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>);
const CloseIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>);
const NotesIcon: React.FC<{ hasNotes?: boolean }> = ({ hasNotes }) => (
  hasNotes ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
      <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
);
const ExpandIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5" /></svg>);
const MaximizeIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0015.5 2h-11zM5 5h10v10H5V5z" clipRule="evenodd" /></svg>);
const RestoreIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM11 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z" /></svg>);
const BoldIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 4h3.454c1.764 0 2.29.387 2.29 1.842 0 1.002-.69 1.43-1.34 1.565.81.163 1.55.73 1.55 1.77C15 10.74 14.15 12 12.015 12H9.05V4zm1.75 3.32h1.15c.65 0 .963-.26.963-.843 0-.585-.313-.842-.963-.842h-1.15v1.685zm0 2.97h1.43c.75 0 1.137-.3 1.137-.962 0-.663-.387-1.002-1.137-1.002h-1.43v1.964z" /></svg>);
const ItalicIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.75 4h5.5a.75.75 0 010 1.5h-1.42l-2.33 9h1.5a.75.75 0 010 1.5h-5.5a.75.75 0 010-1.5h1.42l2.33-9h-1.5a.75.75 0 010-1.5z" /></svg>);
const UnderlineIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 16h10a1 1 0 110 2H5a1 1 0 110-2zm1.5-13a1 1 0 011-1h5a1 1 0 110 2h-1.5v5a2.5 2.5 0 01-5 0V4H6.5a1 1 0 01-1-1zM8 4h4v5a1 1 0 11-2 0V4z" /></svg>);
const StrikethroughIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 10a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1z" clipRule="evenodd" /><path fillRule="evenodd" d="M9.47 4.164A1 1 0 0110.457 3h.51a1 1 0 01.976.783l1.5 5.5a1 1 0 01-.976 1.217H12a1 1 0 110-2h.438l-1.028-3.772a.5.5 0 00-.488-.395h-.51a.5.5 0 00-.489.395L8.562 8H9a1 1 0 110 2H7.467a1 1 0 01-.976-1.217l1.5-5.5a1 1 0 011.48-.62z" clipRule="evenodd" /></svg>);
const BulletListIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 7a2 2 0 11-4 0 2 2 0 014 0zm-2 4a2 2 0 100 4 2 2 0 000-4zm2 4a2 2 0 11-4 0 2 2 0 014 0zm4-8a1 1 0 100-2h8a1 1 0 100 2H9zm0 4a1 1 0 100-2h8a1 1 0 100 2H9zm0 4a1 1 0 100-2h8a1 1 0 100 2H9z" clipRule="evenodd" /></svg>);
const NumberedListIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 4.5a.5.5 0 01.5-.5h.5a.5.5 0 01.5.5v.5h-.5a.5.5 0 01-.5-.5V4.5zM3 3.5a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h.5a.5.5 0 00.5-.5V4a.5.5 0 00-.5-.5H3zM2 9.5a.5.5 0 01.5-.5h.5a.5.5 0 01.5.5v.5h-.5a.5.5 0 01-.5-.5V9.5zM3 8.5a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h.5a.5.5 0 00.5-.5V9a.5.5 0 00-.5-.5H3zm-1 5a.5.5 0 01.5-.5h.5a.5.5 0 01.5.5v.5h-.5a.5.5 0 01-.5-.5v-.5zM3 13.5a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h.5a.5.5 0 00.5-.5v-.5a.5.5 0 00-.5-.5H3z" clipRule="evenodd"/><path fillRule="evenodd" d="M7 5a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></svg>);
const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 ${className || ''}`.trim()} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>);
const OpenInNewIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>);
const DesktopAppIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>);
const FilterIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${className || ''}`.trim()} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" /></svg>);
const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${className || ''}`.trim()} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>);
const MapViewIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 5a1 1 0 100 2h4a1 1 0 100-2H8zM3 8a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm-1 4a1 1 0 100 2h2a1 1 0 100-2H2zm14-1a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM3 15a1 1 0 100 2h4a1 1 0 100-2H3z" /></svg>);
const ListViewIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>);
const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${className || ''}`.trim()} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>);
const ImageIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>);
const ReparentIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-4 4-4-4" /><path d="M15 13V3" /></svg>);

const LinkTypeIcon: React.FC<{type: LinkType}> = ({type}) => {
    switch (type) {
        case 'outlook': return <OutlookIcon />;
        case 'excel': return <ExcelIcon />;
        case 'powerpoint': return <PowerPointIcon />;
        case 'teams': return <TeamsIcon />;
        case 'image': return <ImageIcon />;
        default: return <WebIcon />;
    }
};

// --- EDITOR DE TEXTO ENRIQUECIDO ---
const NotesEditor: React.FC<{
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}> = ({ content, onChange, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Solo actualizar innerHTML si el contenido es realmente diferente del DOM.
    // Esto previene saltos de cursor al no re-renderizar en cada pulsación.
    if (editorRef.current && content !== editorRef.current.innerHTML) {
        editorRef.current.innerHTML = content;
    }
  }, [content]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (editorRef.current) {
      onChange(e.currentTarget.innerHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, text);
    
    // Gestionar pegado de imágenes
    const items = e.clipboardData.items;
    for (const index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.match(/^image\//)) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            document.execCommand('insertHTML', false, `<img src="${dataUrl}" style="max-width: 100%; height: auto; border-radius: 4px;" />`);
            if (editorRef.current) onChange(editorRef.current.innerHTML);
          };
          reader.readAsDataURL(file);
        }
      }
    }
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const execCmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    // Evita que los botones roben el foco del editor
    e.preventDefault();
  };
  
  return (
    <div className="w-full h-full border border-gray-300 rounded-lg flex flex-col bg-white">
        <div className="flex items-center p-1.5 border-b border-gray-200 bg-gray-50 space-x-1 rounded-t-lg sticky top-0">
             <button onMouseDown={handleToolbarMouseDown} onClick={() => execCmd('bold')} className="p-1.5 rounded-md hover:bg-gray-200 transition-colors" aria-label="Negrita" title="Negrita"><BoldIcon/></button>
             <button onMouseDown={handleToolbarMouseDown} onClick={() => execCmd('italic')} className="p-1.5 rounded-md hover:bg-gray-200 transition-colors" aria-label="Cursiva" title="Cursiva"><ItalicIcon/></button>
             <button onMouseDown={handleToolbarMouseDown} onClick={() => execCmd('underline')} className="p-1.5 rounded-md hover:bg-gray-200 transition-colors" aria-label="Subrayado" title="Subrayado"><UnderlineIcon/></button>
             <button onMouseDown={handleToolbarMouseDown} onClick={() => execCmd('strikeThrough')} className="p-1.5 rounded-md hover:bg-gray-200 transition-colors" aria-label="Tachado" title="Tachado"><StrikethroughIcon/></button>
             <div className="w-px h-5 bg-gray-300 mx-1"></div>
             <button onMouseDown={handleToolbarMouseDown} onClick={() => execCmd('insertUnorderedList')} className="p-1.5 rounded-md hover:bg-gray-200 transition-colors" aria-label="Lista de Viñetas" title="Lista de Viñetas"><BulletListIcon/></button>
             <button onMouseDown={handleToolbarMouseDown} onClick={() => execCmd('insertOrderedList')} className="p-1.5 rounded-md hover:bg-gray-200 transition-colors" aria-label="Lista Numerada" title="Lista Numerada"><NumberedListIcon/></button>
             <select onMouseDown={handleToolbarMouseDown} onChange={(e) => execCmd('formatBlock', e.target.value)} className="text-sm border-gray-200 rounded-md focus:ring-red-500 focus:border-red-500 ml-2" title="Formato de texto">
                <option value="p">Normal</option>
                <option value="h1">Título 1</option>
                <option value="h2">Título 2</option>
                <option value="h3">Título 3</option>
            </select>
        </div>
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onPaste={handlePaste}
          className="flex-grow p-3 focus:outline-none text-gray-800 overflow-auto"
          data-placeholder={placeholder}
          style={{minHeight: '100px'}}
        ></div>
    </div>
  );
};


// --- COMPONENTES DE MODAL Y BARRA LATERAL ---
const AddOwnerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, imageUrl: string, teamsUrl: string) => void;
}> = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [teamsUrl, setTeamsUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setImageUrl('');
      setTeamsUrl('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (name.trim() && imageUrl.trim()) {
      onSave(name.trim(), imageUrl.trim(), teamsUrl.trim());
    }
  };
  
  const canSave = name.trim() && imageUrl.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Añadir Owner</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-600 focus:outline-none" aria-label="Cerrar modal">
            <CloseIcon />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="owner-name" className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input type="text" id="owner-name" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="Ej: Ana García" required/>
          </div>
          <div>
            <label htmlFor="owner-image-url" className="block text-sm font-medium text-gray-700 mb-1">URL de la Imagen (PNG, JPG)</label>
            <input type="url" id="owner-image-url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="https://.../imagen.png" required/>
            <p className="text-xs text-gray-500 mt-1">Pega la URL completa de la imagen. Debe ser accesible públicamente.</p>
          </div>
          <div>
            <label htmlFor="owner-teams-url" className="block text-sm font-medium text-gray-700 mb-1">URL de Teams (opcional)</label>
            <input type="url" id="owner-teams-url" value={teamsUrl} onChange={e => setTeamsUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="https://teams.microsoft.com/l/user/..."/>
          </div>
        </div>
        <div className="flex justify-end p-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <button onClick={onClose} className="text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors mr-2">Cancelar</button>
          <button onClick={handleSave} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 disabled:opacity-50" disabled={!canSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
};

const AddMeetingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, time: string, url: string) => void;
}> = ({ isOpen, onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setTime('');
      setUrl('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (title.trim() && time.trim() && url.trim()) {
      onSave(title.trim(), time.trim(), url.trim());
    }
  };
  
  const canSave = title.trim() && time.trim() && url.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Añadir Reunión</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-600 focus:outline-none" aria-label="Cerrar modal">
            <CloseIcon />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="meeting-title" className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input type="text" id="meeting-title" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="Ej: Daily Standup" required/>
          </div>
          <div>
            <label htmlFor="meeting-time" className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
            <input type="time" id="meeting-time" value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" required/>
          </div>
          <div>
            <label htmlFor="meeting-url" className="block text-sm font-medium text-gray-700 mb-1">URL de la Reunión</label>
            <input type="url" id="meeting-url" value={url} onChange={e => setUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="https://teams.microsoft.com/..." required/>
          </div>
        </div>
        <div className="flex justify-end p-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <button onClick={onClose} className="text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors mr-2">Cancelar</button>
          <button onClick={handleSave} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 disabled:opacity-50" disabled={!canSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
};

const AddLinkModal: React.FC<{
  modalState: AddLinkModalState;
  onClose: () => void;
  onSave: (nodeId: number, title: string, url: string, type: LinkType, desktopUrl: string) => void;
}> = ({ modalState, onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [desktopUrl, setDesktopUrl] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('web');
  
  useEffect(() => {
    if (url.includes('outlook.live.com') || url.includes('outlook.office.com')) setLinkType('outlook');
    else if (url.includes('sharepoint.com') && (url.includes('.xlsx') || url.includes('.xls'))) setLinkType('excel');
    else if (url.includes('sharepoint.com') && (url.includes('.pptx') || url.includes('.ppt'))) setLinkType('powerpoint');
    else if (url.includes('teams.microsoft.com')) setLinkType('teams');
    else setLinkType('web');
  }, [url]);

  useEffect(() => {
    if (modalState.isOpen) {
      setTitle('');
      setUrl('');
      setDesktopUrl('');
      setLinkType('web');
    }
  }, [modalState.isOpen]);

  if (!modalState.isOpen) return null;

  const canSave = url.trim() !== '' || desktopUrl.trim() !== '';

  const handleSave = () => {
    if (canSave && modalState.nodeId) {
      onSave(modalState.nodeId, title.trim() || url.trim() || desktopUrl.trim(), url.trim(), linkType, desktopUrl.trim());
    }
  };

  const linkTypes: {id: LinkType, label: string}[] = [
      {id: 'web', label: 'Web'},
      {id: 'outlook', label: 'Outlook'},
      {id: 'excel', label: 'Excel'},
      {id: 'powerpoint', label: 'PowerPoint'},
      {id: 'teams', label: 'Teams'}
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Añadir Enlace</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-600 focus:outline-none" aria-label="Cerrar modal">
            <CloseIcon />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="link-url" className="block text-sm font-medium text-gray-700 mb-1">URL (Web)</label>
            <input type="url" id="link-url" value={url} onChange={e => setUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="https://ejemplo.com"/>
          </div>
          <div>
            <label htmlFor="link-desktop-url" className="block text-sm font-medium text-gray-700 mb-1">URL de App de escritorio (opcional)</label>
            <input type="text" id="link-desktop-url" value={desktopUrl} onChange={e => setDesktopUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="msteams://..."/>
          </div>
          <p className="text-xs text-gray-500 -mt-2">Debe rellenar al menos uno de los dos campos de URL.</p>
          <div>
            <label htmlFor="link-title" className="block text-sm font-medium text-gray-700 mb-1">Título (opcional)</label>
            <input type="text" id="link-title" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="Ej: Documento de diseño"/>
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de enlace</label>
            <div className="flex flex-wrap gap-2">
                {linkTypes.map(typeInfo => (
                    <button key={typeInfo.id} onClick={() => setLinkType(typeInfo.id)} className={`px-3 py-1 text-sm rounded-full border-2 ${linkType === typeInfo.id ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:border-red-500'}`}>{typeInfo.label}</button>
                ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end p-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <button onClick={onClose} className="text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors mr-2">Cancelar</button>
          <button onClick={handleSave} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 disabled:opacity-50" disabled={!canSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
};

const AddImageModal: React.FC<{
  modalState: AddImageModalState;
  onClose: () => void;
  onSave: (nodeId: number, title: string, url: string, imageData: string) => void;
}> = ({ modalState, onClose, onSave }) => {
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [imageData, setImageData] = useState<string | null>(null);

    useEffect(() => {
        if (modalState.isOpen) {
            setTitle('');
            setUrl('');
            setImageData(null);
        }
    }, [modalState.isOpen]);

    if (!modalState.isOpen) return null;

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        setImageData(event.target?.result as string);
                    };
                    reader.readAsDataURL(file);
                    e.preventDefault();
                    break;
                }
            }
        }
    };
    
    const canSave = imageData !== null;

    const handleSave = () => {
        if (canSave && modalState.nodeId && imageData) {
            onSave(modalState.nodeId, title.trim(), url.trim(), imageData);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">Añadir Imagen</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-600 focus:outline-none" aria-label="Cerrar modal">
                        <CloseIcon />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div
                        onPaste={handlePaste}
                        className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                        tabIndex={0}
                    >
                        {imageData ? (
                            <img src={imageData} alt="Previsualización" className="max-h-full max-w-full object-contain" />
                        ) : (
                            <span>Pega una imagen aquí (Ctrl+V)</span>
                        )}
                    </div>
                     <div>
                        <label htmlFor="image-title" className="block text-sm font-medium text-gray-700 mb-1">Título (opcional)</label>
                        <input type="text" id="image-title" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="Ej: Captura de pantalla"/>
                    </div>
                    <div>
                        <label htmlFor="image-url" className="block text-sm font-medium text-gray-700 mb-1">URL de origen (opcional)</label>
                        <input type="url" id="image-url" value={url} onChange={e => setUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" placeholder="https://origen-de-la-imagen.com"/>
                    </div>
                </div>
                <div className="flex justify-end p-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                    <button onClick={onClose} className="text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors mr-2">Cancelar</button>
                    <button onClick={handleSave} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 disabled:opacity-50" disabled={!canSave}>Guardar</button>
                </div>
            </div>
        </div>
    );
};


const SideBrowser: React.FC<{ link: Link | null; onClose: () => void }> = ({ link, onClose }) => {
    if (!link) return null;
    return (
        <div className="absolute top-0 right-0 h-full w-full md:w-1/2 lg:w-2/5 bg-white shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out" style={{transform: link ? 'translateX(0%)' : 'translateX(100%)'}}>
            <div className="flex justify-between items-center p-3 border-b border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 truncate ml-2 flex-grow">{link.title}</p>
                 <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {link.desktopUrl && (
                        <a href={link.desktopUrl} target="_blank" rel="noopener noreferrer" title="Abrir en App de Escritorio" className="p-1.5 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-200 transition-colors">
                            <LinkTypeIcon type={link.type} />
                        </a>
                    )}
                    <a href={link.url} target="_blank" rel="noopener noreferrer" title="Abrir en nueva pestaña" className="p-1.5 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-200 transition-colors">
                        <OpenInNewIcon />
                    </a>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-200" aria-label="Cerrar navegador">
                        <CloseIcon />
                    </button>
                </div>
            </div>
            <iframe src={link.url} className="w-full h-full border-0" title="Contenido del Enlace"></iframe>
        </div>
    );
};

const SideNotesPanel: React.FC<{
  node: Node | undefined;
  onClose: () => void;
  onSaveNotes: (nodeId: number, notes: string) => void;
}> = ({ node, onClose, onSaveNotes }) => {
  if (!node) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-full md:w-1/2 lg:w-2/5 bg-white shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out" style={{transform: node ? 'translateX(0%)' : 'translateX(100%)'}}>
      <div className="flex justify-between items-center p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700 truncate ml-2">Notas para: {node.text}</h3>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-200" aria-label="Cerrar notas">
          <CloseIcon />
        </button>
      </div>
      <div className="p-4 flex-grow min-h-0">
          <NotesEditor 
            content={node.notes}
            onChange={(content) => onSaveNotes(node.id, content)}
            placeholder="Escribe tus notas aquí... ¡puedes pegar imágenes!"
          />
      </div>
    </div>
  );
};

// --- COMPONENTES DE VISTA DE FOCO ---

const LinkEmbed: React.FC<{ link: Link; isMaximized: boolean; onMaximize: () => void; onRestore: () => void; }> = ({ link, isMaximized, onMaximize, onRestore }) => (
    <div className="bg-white rounded-lg shadow-md flex flex-col h-full border border-gray-200">
      <div className="flex justify-between items-center p-2 bg-gray-100 border-b">
        <span className="text-xs font-semibold text-gray-700 truncate">{link.title}</span>
        <button onClick={isMaximized ? onRestore : onMaximize} className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-full" title={isMaximized ? "Restaurar" : "Maximizar"}>
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
      </div>
      <iframe src={link.url} className="w-full h-full border-0" title={link.title}></iframe>
    </div>
);

const FocusView: React.FC<{
    node: Node;
    owners: Owner[];
    ownersById: Map<number, Owner>;
    onClose: () => void;
    onSaveNotes: (nodeId: number, notes: string) => void;
    onUpdateText: (nodeId: number, text: string) => void;
    onAddSubtask: (nodeId: number) => void;
    onToggleSubtask: (nodeId: number, subtaskId: number) => void;
    onUpdateSubtaskText: (nodeId: number, subtaskId: number, text: string) => void;
    onSetSubtaskEditing: (nodeId: number, subtaskId: number) => void;
    onAddTag: (nodeId: number, tag: string) => void;
    onRemoveTag: (nodeId: number, tagIndex: number) => void;
    onAssignOwner: (nodeId: number, ownerId: number) => void;
    onRemoveOwner: (nodeId: number, ownerId: number) => void;
    onAddLink: (nodeId: number) => void;
    onRemoveLink: (nodeId: number, linkId: number) => void;
    onAssignOwnerToSubtask: (nodeId: number, subtaskId: number, ownerId: number) => void;
    onRemoveOwnerFromSubtask: (nodeId: number, subtaskId: number, ownerId: number) => void;
    onReorderSubtasks: (nodeId: number, dragId: number, dropId: number) => void;
}> = (props) => {
    const { node, owners, ownersById, onClose, onSaveNotes, onUpdateText, onAddSubtask, onToggleSubtask, onUpdateSubtaskText, onSetSubtaskEditing, onAddTag, onRemoveTag, onAssignOwner, onRemoveOwner, onAddLink, onRemoveLink, onAssignOwnerToSubtask, onRemoveOwnerFromSubtask, onReorderSubtasks } = props;
    const [maximizedLinkId, setMaximizedLinkId] = useState<number | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleText, setTitleText] = useState(node.text);
    const [tagInput, setTagInput] = useState('');
    const dragSubtaskInfo = useRef<{nodeId: number, subtaskId: number} | null>(null);


    useEffect(() => {
        setTitleText(node.text);
    }, [node.text]);

    const handleTitleBlur = () => {
        if (titleText.trim()) {
            onUpdateText(node.id, titleText);
        } else {
            setTitleText(node.text);
        }
        setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleTitleBlur();
        else if (e.key === 'Escape') {
            setTitleText(node.text);
            setIsEditingTitle(false);
        }
    };

    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            onAddTag(node.id, tagInput.trim());
            setTagInput('');
        }
    };

    const unassignedOwners = owners.filter(owner => !node.ownerIds.includes(owner.id));

    const webLinks = node.links.filter(link => link.type !== 'image' && link.url);
    const desktopOnlyLinks = node.links.filter(link => !link.url && link.desktopUrl);

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex flex-col p-4 md:p-8" role="dialog" aria-modal="true">
            <div className="bg-white rounded-xl shadow-2xl w-full h-full flex flex-col">
                <header className="flex justify-between items-center p-4 border-b">
                    <div>
                        {isEditingTitle ? (
                            <input
                                type="text"
                                value={titleText}
                                onChange={e => setTitleText(e.target.value)}
                                onBlur={handleTitleBlur}
                                onKeyDown={handleTitleKeyDown}
                                autoFocus
                                className="text-2xl font-bold text-gray-800 bg-transparent border-b-2 border-red-500 focus:outline-none w-full"
                            />
                        ) : (
                            <h2 className="text-2xl font-bold text-red-600 cursor-pointer" onDoubleClick={() => setIsEditingTitle(true)} title="Doble clic para editar">{node.text}</h2>
                        )}
                        <div className="mt-2 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                {node.ownerIds.map(ownerId => {
                                    const owner = ownersById.get(ownerId);
                                    return owner ? (
                                        <div key={owner.id} className="group relative">
                                            <img src={owner.imageUrl} alt={owner.name} title={owner.name} className="w-7 h-7 rounded-full" />
                                            <button onClick={() => onRemoveOwner(node.id, owner.id)} className="absolute -top-1 -right-1 bg-gray-600 text-white rounded-full h-4 w-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Quitar owner">&times;</button>
                                        </div>
                                    ) : null;
                                })}
                                {unassignedOwners.length > 0 && (
                                    <select onChange={e => onAssignOwner(node.id, parseInt(e.target.value))} value="" className="text-xs border-gray-300 rounded focus:ring-red-500 focus:border-red-500 h-7">
                                        <option value="" disabled>+ Asignar</option>
                                        {unassignedOwners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                                    </select>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {node.tags.map((tag, index) => (
                                    <span key={index} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full flex items-center">
                                        {tag}
                                        <button onClick={() => onRemoveTag(node.id, index)} className="ml-1 text-red-600 hover:text-red-800" aria-label={`Quitar tag ${tag}`}>&times;</button>
                                    </span>
                                ))}
                                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagInputKeyDown} placeholder="+ Tag" className="text-xs bg-gray-100 rounded px-1 w-20 focus:ring-1 focus:ring-red-500 focus:outline-none"/>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-600 hover:text-red-700 rounded-full hover:bg-gray-100 self-start">
                        <CloseIcon />
                    </button>
                </header>
                <div className="flex-grow flex flex-col md:flex-row gap-4 p-4 overflow-hidden">
                    <div className="w-full md:w-1/3 flex flex-col space-y-4 min-h-0">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Subtareas</h3>
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                                {node.subtasks.map(subtask => {
                                    const unassignedSubtaskOwners = owners.filter(o => !subtask.ownerIds.includes(o.id));
                                    return (
                                        <div key={subtask.id} 
                                            className="flex items-center text-sm p-1 rounded-md hover:bg-gray-50 cursor-grab"
                                            draggable
                                            onDragStart={() => dragSubtaskInfo.current = { nodeId: node.id, subtaskId: subtask.id}}
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={() => {
                                                if (dragSubtaskInfo.current) {
                                                    onReorderSubtasks(node.id, dragSubtaskInfo.current.subtaskId, subtask.id);
                                                    dragSubtaskInfo.current = null;
                                                }
                                            }}
                                        >
                                            <input type="checkbox" checked={subtask.completed} onChange={() => onToggleSubtask(node.id, subtask.id)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                                            {subtask.isEditing ? (
                                                <input type="text" defaultValue={subtask.text} autoFocus onBlur={(e) => onUpdateSubtaskText(node.id, subtask.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} className="ml-2 text-gray-700 w-full bg-gray-100 rounded px-1 py-0.5 focus:ring-1 focus:ring-red-500 focus:outline-none" />
                                            ) : (
                                                <span onDoubleClick={() => onSetSubtaskEditing(node.id, subtask.id)} className={`ml-2 text-gray-700 cursor-pointer ${subtask.completed ? 'line-through text-gray-400' : ''}`}>
                                                    {subtask.text || <i className="text-gray-400">Nueva Subtarea</i>}
                                                </span>
                                            )}
                                            <div className="ml-auto flex items-center pl-2">
                                                {subtask.ownerIds.map(oid => ownersById.get(oid)).filter(Boolean).map(owner => (
                                                    <div key={owner!.id} className="group relative -ml-1">
                                                        <img src={owner!.imageUrl} alt={owner!.name} title={owner!.name} className="w-5 h-5 rounded-full border border-white" />
                                                        <button onClick={() => onRemoveOwnerFromSubtask(node.id, subtask.id, owner!.id)} className="absolute -top-1 -right-1 bg-gray-600 text-white rounded-full h-3 w-3 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100" aria-label={`Quitar owner ${owner!.name} de la subtarea`}>&times;</button>
                                                    </div>
                                                ))}
                                                <select onChange={(e) => onAssignOwnerToSubtask(node.id, subtask.id, parseInt(e.target.value))} value="" className="text-xs border-gray-300 rounded focus:ring-red-500 focus:border-red-500 h-6 w-6 p-0 text-center bg-gray-100 hover:bg-gray-200">
                                                    <option value="" disabled>+</option>
                                                    {unassignedSubtaskOwners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                                <button onClick={() => onAddSubtask(node.id)} className="text-sm text-red-600 hover:text-red-800 mt-2 ml-1">+ Añadir subtarea</button>
                            </div>
                        </div>
                         {desktopOnlyLinks.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800 my-2">Enlaces de Escritorio</h3>
                                <div className="space-y-1 max-h-24 overflow-y-auto pr-2">
                                    {desktopOnlyLinks.map(link => (
                                        <a key={link.id} href={link.desktopUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-1.5 rounded-md hover:bg-gray-100 text-sm text-gray-700">
                                            <LinkTypeIcon type={link.type} />
                                            <span className="truncate">{link.title}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                         )}
                        <div className="flex-grow flex flex-col min-h-0">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Notas</h3>
                            <NotesEditor content={node.notes} onChange={(content) => onSaveNotes(node.id, content)} placeholder="Escribe tus notas aquí..." />
                        </div>
                    </div>
                    <div className="w-full md:w-2/3 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-gray-800">Enlaces Web</h3>
                            <button onClick={() => onAddLink(node.id)} className="text-sm font-semibold text-red-600 hover:text-red-800 flex items-center gap-1 p-1 rounded-md hover:bg-red-50">
                                <AddIcon /> Añadir
                            </button>
                        </div>
                        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 p-2 bg-gray-50 rounded-lg overflow-auto">
                            {webLinks.map(link => (
                                <div key={link.id} className={`group relative ${maximizedLinkId && maximizedLinkId !== link.id ? 'hidden' : ''} ${maximizedLinkId === link.id ? 'col-span-full row-span-full' : ''}`}>
                                    <LinkEmbed
                                        link={link}
                                        isMaximized={maximizedLinkId === link.id}
                                        onMaximize={() => setMaximizedLinkId(link.id)}
                                        onRestore={() => setMaximizedLinkId(null)}
                                    />
                                     <button 
                                        onClick={() => onRemoveLink(node.id, link.id)} 
                                        className="absolute top-2 right-10 z-10 p-1 bg-gray-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" 
                                        aria-label="Quitar enlace"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                            {webLinks.length === 0 && <p className="text-gray-500 text-center col-span-full self-center">No hay enlaces web para esta tarea.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- COMPONENTE NODO ---
const NodeComponent: React.FC<{
  node: Node;
  ownersById: Map<number, Owner>;
  meetingsById: Map<number, Meeting>;
  reparentingNodeId: number | null;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>, nodeId: number) => void;
  onNodeClick: (nodeId: number) => void;
  onSetReparentingMode: (nodeId: number) => void;
  onAddLink: (nodeId: number) => void;
  onAddImage: (nodeId: number) => void;
  onRemoveLink: (nodeId: number, linkId: number) => void;
  onAddChild: (nodeId: number) => void;
  onOpenLink: (link: Link) => void;
  onUpdateText: (nodeId: number, text: string) => void;
  onToggleEdit: (nodeId: number) => void;
  onOpenNotes: (nodeId: number) => void;
  onOpenFocusView: (nodeId: number) => void;
  onAddSubtask: (nodeId: number) => void;
  onToggleSubtask: (nodeId: number, subtaskId: number) => void;
  onUpdateSubtaskText: (nodeId: number, subtaskId: number, text: string) => void;
  onSetSubtaskEditing: (nodeId: number, subtaskId: number) => void;
  onAddTag: (nodeId: number, tag: string) => void;
  onRemoveTag: (nodeId: number, tagIndex: number) => void;
  onAssignOwner: (nodeId: number, ownerId: number) => void;
  onAssignMeeting: (nodeId: number, meetingId: number) => void;
  onRemoveMeeting: (nodeId: number, meetingId: number) => void;
  onCyclePriority: (nodeId: number) => void;
  onSetNodeFilter: (nodeId: number) => void;
  onShowImagePreview: (imageData: string, rect: DOMRect) => void;
  onHideImagePreview: () => void;
  onOpenImageViewer: (link: Link) => void;
}> = (props) => {
  const { node, ownersById, meetingsById, reparentingNodeId, onMouseDown, onNodeClick, onSetReparentingMode, onAddLink, onAddImage, onRemoveLink, onAddChild, onOpenLink, onUpdateText, onToggleEdit, onOpenNotes, onOpenFocusView, onAddSubtask, onToggleSubtask, onUpdateSubtaskText, onSetSubtaskEditing, onAddTag, onRemoveTag, onAssignOwner, onAssignMeeting, onRemoveMeeting, onCyclePriority, onSetNodeFilter, onShowImagePreview, onHideImagePreview, onOpenImageViewer } = props;
  const [editText, setEditText] = useState(node.text);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (node.isEditing) {
        setEditText(node.text);
    }
  }, [node.isEditing, node.text]);

  const handleTextUpdate = () => onUpdateText(node.id, editText || 'Nueva Tarea');

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
        e.preventDefault();
        onAddTag(node.id, tagInput.trim());
        setTagInput('');
    }
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const ownerId = e.dataTransfer.getData("application/owner-id");
      const tagName = e.dataTransfer.getData("application/tag-name");
      const meetingId = e.dataTransfer.getData("application/meeting-id");

      if (ownerId) {
          onAssignOwner(node.id, parseInt(ownerId, 10));
      } else if (tagName) {
          onAddTag(node.id, tagName);
      } else if (meetingId) {
          onAssignMeeting(node.id, parseInt(meetingId, 10));
      }
  };

  const hasContentInNotes = useMemo(() => {
    if (!node.notes) return false;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = node.notes;
    return (tempDiv.textContent || "").trim().length > 0 || tempDiv.querySelector('img') !== null;
  }, [node.notes]);

  if (node.isEditing) {
    return (
      <div className="absolute bg-white border-2 border-red-500 rounded-lg shadow-lg p-3 flex flex-col z-20" style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>
        <textarea
          value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={handleTextUpdate}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextUpdate(); } }}
          className="w-full h-full text-sm font-semibold text-gray-800 border-0 p-0 resize-none focus:ring-0" autoFocus
        />
      </div>
    );
  }

  const isBeingReparented = reparentingNodeId === node.id;
  const isReparentingTarget = reparentingNodeId !== null && !isBeingReparented;

  return (
    <div
      id={`node-${node.id}`}
      className={`absolute bg-white border-2 rounded-lg shadow-md p-3 flex flex-col transition-all duration-300 hover:shadow-xl z-10 
        ${isBeingReparented ? 'border-dashed border-blue-500 ring-2 ring-blue-200 cursor-pointer' : 'border-gray-200 hover:border-red-500'}
        ${isReparentingTarget ? 'cursor-crosshair' : 'cursor-grab'}
      `}
      style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}
      onMouseDown={(e) => onMouseDown(e, node.id)} onDoubleClick={() => onToggleEdit(node.id)}
      onClick={() => onNodeClick(node.id)}
      onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
      role="treeitem" aria-label={`Tarea: ${node.text}`}
    >
        <div className="flex items-center">
             <button
                onClick={(e) => {e.stopPropagation(); onCyclePriority(node.id);}}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0 transition-colors ${PRIORITY_STYLES[node.priority].bg} ${PRIORITY_STYLES[node.priority].text}`}
                aria-label={`Cambiar prioridad. Actual: ${PRIORITY_STYLES[node.priority].label}`}
                title={`Prioridad: ${PRIORITY_STYLES[node.priority].label}`}
             >
                {node.priority > 0 ? PRIORITY_STYLES[node.priority].label : <div className="w-3 h-3 rounded-full border-2 border-gray-400"></div>}
            </button>
            <div className="text-sm font-semibold text-gray-800 whitespace-pre-wrap break-words">{node.text}</div>
        </div>
      
       {node.subtasks.length > 0 && (
         <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
           {node.subtasks.map(subtask => (
             <div key={subtask.id} className="flex items-center text-xs">
               <input type="checkbox" checked={subtask.completed} onChange={() => onToggleSubtask(node.id, subtask.id)} className="h-3 w-3 rounded border-gray-300 text-red-600 focus:ring-red-500"/>
                {subtask.isEditing ? (
                    <input
                        type="text"
                        defaultValue={subtask.text}
                        autoFocus
                        onBlur={(e) => onUpdateSubtaskText(node.id, subtask.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                        className="ml-2 text-gray-600 text-xs w-full bg-gray-100 rounded px-1 py-0.5 focus:ring-1 focus:ring-red-500 focus:outline-none"
                    />
                ) : (
                    <span onDoubleClick={() => onSetSubtaskEditing(node.id, subtask.id)} className={`ml-2 text-gray-600 cursor-pointer ${subtask.completed ? 'line-through text-gray-400' : ''}`}>
                      {subtask.text || <i className="text-gray-400">Nueva Subtarea</i>}
                    </span>
                )}
             </div>
           ))}
         </div>
       )}
        <div className="mt-auto pt-2 border-t border-gray-100 space-y-2">
            {/* Owners y Tags */}
            <div className="flex flex-wrap items-center gap-1.5">
                {node.ownerIds.map(ownerId => {
                    const owner = ownersById.get(ownerId);
                    return owner ? (
                      <a key={owner.id} href={owner.teamsUrl} target="_blank" rel="noopener noreferrer" onClick={e => {e.stopPropagation(); if (!owner.teamsUrl) e.preventDefault();}} title={owner.name}>
                        <img src={owner.imageUrl} alt={owner.name} className="w-5 h-5 rounded-full" />
                      </a>
                     ) : null;
                })}
                {node.meetingIds.map(meetingId => {
                    const meeting = meetingsById.get(meetingId);
                    return meeting ? (
                        <a key={meeting.id} href={meeting.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={`${meeting.title} at ${meeting.time}`} className="group relative text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                            <CalendarIcon /> {meeting.time}
                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemoveMeeting(node.id, meeting.id); }} className="absolute -top-1 -right-1 bg-gray-600 text-white rounded-full h-3.5 w-3.5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" aria-label={`Quitar reunión ${meeting.title}`}>&times;</button>
                        </a>
                     ) : null;
                })}
                {node.tags.map((tag, index) => (
                    <span key={index} className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full flex items-center">
                        {tag}
                        <button onClick={(e) => { e.stopPropagation(); onRemoveTag(node.id, index); }} className="ml-1 text-red-600 hover:text-red-800">&times;</button>
                    </span>
                ))}
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} placeholder="+ Tag" className="text-xs bg-gray-100 rounded px-1.5 py-0.5 w-16 focus:ring-1 focus:ring-red-500 focus:outline-none"/>
            </div>
            {/* Enlaces */}
            {node.links.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap border-t border-gray-100 pt-1.5 mt-1.5">
                  {node.links.map(link => (
                    <div key={link.id} className="group relative">
                        <button onClick={(e) => { e.stopPropagation(); link.type === 'image' ? onOpenImageViewer(link) : onOpenLink(link); }}
                          onMouseEnter={(e) => { if (link.type === 'image' && link.imageData) onShowImagePreview(link.imageData, e.currentTarget.getBoundingClientRect()) }}
                          onMouseLeave={(e) => { if (link.type === 'image') onHideImagePreview() }}
                          className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-400 rounded p-0.5"
                          aria-label={`Abrir enlace ${link.title}`} title={link.title}>
                            <LinkTypeIcon type={link.type} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onRemoveLink(node.id, link.id)}} className="absolute -top-1 -right-1 bg-gray-600 text-white rounded-full h-3.5 w-3.5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Quitar enlace">&times;</button>
                    </div>
                  ))}
                </div>
            )}
            {/* Acciones */}
            <div className="flex items-center justify-end">
                <div className="flex items-center gap-0.5">
                   <button onClick={(e) => { e.stopPropagation(); onSetReparentingMode(node.id); }} className={`p-1 rounded-full hover:bg-gray-100 transition-colors ${isBeingReparented ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-red-600'}`} aria-label="Recolocar nodo" title="Recolocar Nodo"><ReparentIcon /></button>
                   <button onClick={(e) => { e.stopPropagation(); onSetNodeFilter(node.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors" aria-label="Filtrar por este nodo" title="Filtrar por este nodo"><FilterIcon /></button>
                   <button onClick={(e) => { e.stopPropagation(); onAddSubtask(node.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors" aria-label="Añadir subtarea" title="Añadir Subtarea">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  </button>
                   <button onClick={(e) => { e.stopPropagation(); onOpenFocusView(node.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors" aria-label="Abrir vista de foco" title="Abrir Vista de Foco"><ExpandIcon /></button>
                   <button onClick={(e) => { e.stopPropagation(); onOpenNotes(node.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors" aria-label="Añadir o editar notas" title="Añadir/Editar Notas"><NotesIcon hasNotes={hasContentInNotes} /></button>
                  <button onClick={(e) => { e.stopPropagation(); onAddImage(node.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors" aria-label="Añadir imagen" title="Añadir Imagen"><ImageIcon /></button>
                  <button onClick={(e) => { e.stopPropagation(); onAddLink(node.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors" aria-label="Añadir enlace" title="Añadir Enlace"><LinkIcon /></button>
                  <button onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors" aria-label="Añadir tarea hija" title="Añadir Tarea Hija"><AddIcon /></button>
                </div>
            </div>
        </div>
    </div>
  );
};


// --- COMPONENTES DE VISTA DE LISTA Y REUNIÓN ---
const ListView: React.FC<{
    nodes: Node[];
    ownersById: Map<number, Owner>;
    onSaveNotes: (nodeId: number, notes: string) => void;
}> = ({ nodes, ownersById, onSaveNotes }) => {
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

    const nodesById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const childrenByParentId = useMemo(() => {
        const map = new Map<number | null, Node[]>();
        nodes.forEach(node => {
            const children = map.get(node.parentId) || [];
            children.push(node);
            map.set(node.parentId, children);
        });
        return map;
    }, [nodes]);

    const selectedNode = selectedNodeId ? nodesById.get(selectedNodeId) : null;
    
    const TaskListItem: React.FC<{ node: Node; level: number }> = ({ node, level }) => {
        const children = childrenByParentId.get(node.id) || [];
        const [isExpanded, setIsExpanded] = useState(true);

        return (
            <li>
                <div
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`flex items-center p-2 rounded-md cursor-pointer hover:bg-gray-100 ${selectedNodeId === node.id ? 'bg-red-50' : ''}`}
                    style={{ paddingLeft: `${level * 1.5 + 0.5}rem`}}
                >
                    {children.length > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="mr-1 p-0.5 rounded-full hover:bg-gray-200">
                        <ChevronRightIcon className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                    )}
                    <span className="font-medium text-gray-800 truncate">{node.text}</span>
                    <div className="ml-auto flex items-center pl-2">
                        {node.ownerIds.map(oid => ownersById.get(oid)).filter(Boolean).map(owner => (
                            <img key={owner!.id} src={owner!.imageUrl} alt={owner!.name} title={owner!.name} className="w-5 h-5 rounded-full border border-white -ml-1" />
                        ))}
                    </div>
                </div>
                {isExpanded && (
                    <>
                        {node.subtasks.length > 0 && (
                            <ul className="pl-2">
                                {node.subtasks.map(subtask => (
                                    <li key={subtask.id} 
                                        className="flex items-center text-sm py-1 text-gray-600 rounded"
                                        style={{ paddingLeft: `${level * 1.5 + 1.5}rem`}}>
                                        <input type="checkbox" checked={subtask.completed} readOnly className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 mr-2 flex-shrink-0" />
                                        <span className={`truncate ${subtask.completed ? 'line-through text-gray-400' : ''}`}>{subtask.text}</span>
                                        <div className="ml-auto flex items-center pl-2 flex-shrink-0">
                                            {subtask.ownerIds.map(oid => ownersById.get(oid)).filter(Boolean).map(owner => (
                                                <img key={owner!.id} src={owner!.imageUrl} alt={owner!.name} title={owner!.name} className="w-4 h-4 rounded-full border border-white -ml-1" />
                                            ))}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {children.length > 0 && (
                            <ul>
                                {children.map(child => <TaskListItem key={child.id} node={child} level={level + 1} />)}
                            </ul>
                        )}
                    </>
                )}
            </li>
        )
    }

    return (
        <div className="flex h-full w-full bg-white">
            <div className="w-1/3 h-full overflow-y-auto border-r border-gray-200 p-2">
                <ul className="space-y-1">
                    {(childrenByParentId.get(null) || []).map(rootNode => <TaskListItem key={rootNode.id} node={rootNode} level={0} />)}
                </ul>
            </div>
            <div className="w-2/3 h-full overflow-y-auto">
                {selectedNode ? (
                     <div className="p-6 h-full flex flex-col">
                        <h2 className="text-2xl font-bold text-red-600 mb-4">{selectedNode.text}</h2>
                        <div className="flex-grow grid grid-cols-2 gap-6 min-h-0">
                            {/* Left Column: Notes & Desktop Links */}
                            <div className="flex flex-col space-y-4 min-h-0">
                                <div className="flex-grow flex flex-col min-h-0">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Notas</h3>
                                    <NotesEditor content={selectedNode.notes} onChange={(content) => onSaveNotes(selectedNode.id, content)} />
                                </div>
                                {selectedNode.links.filter(l => l.desktopUrl && !l.url).length > 0 && (
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Enlaces de Escritorio</h3>
                                        <div className="space-y-2">
                                            {selectedNode.links.filter(l => l.desktopUrl && !l.url).map(link => (
                                                <a key={link.id} href={link.desktopUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 border text-sm text-gray-700">
                                                    <LinkTypeIcon type={link.type} />
                                                    <span className="truncate font-medium">{link.title}</span>
                                                    <OpenInNewIcon className="ml-auto text-gray-400" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Right Column: Web Links */}
                            <div className="flex flex-col min-h-0">
                                <h3 className="text-lg font-semibold text-gray-800 mb-2">Enlaces Web</h3>
                                <div className="flex-grow space-y-4 overflow-auto pr-2">
                                    {selectedNode.links.filter(l => l.type !== 'image' && l.url).map(link => (
                                        <div key={link.id} className="bg-white rounded-lg shadow-md flex flex-col h-64 border border-gray-200">
                                            <div className="flex justify-between items-center p-2 bg-gray-100 border-b">
                                                <span className="text-xs font-semibold text-gray-700 truncate flex items-center gap-2">
                                                    <LinkTypeIcon type={link.type} /> {link.title}
                                                </span>
                                                <a href={link.url} target="_blank" rel="noopener noreferrer" title="Abrir en nueva pestaña" className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-full">
                                                    <OpenInNewIcon />
                                                </a>
                                            </div>
                                            <iframe src={link.url} className="w-full h-full border-0" title={link.title}></iframe>
                                        </div>
                                    ))}
                                    {selectedNode.links.filter(l => l.type !== 'image' && l.url).length === 0 && (
                                        <div className="flex items-center justify-center h-full text-gray-500 bg-gray-50 rounded-lg">
                                            <p>No hay enlaces web para esta tarea.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <p>Seleccione una tarea de la lista para ver sus detalles.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


const MeetingViewModal: React.FC<{
  meeting: Meeting;
  nodes: Node[];
  ownersById: Map<number, Owner>;
  onClose: () => void;
  onSaveNotes: (meetingId: number, notes: string) => void;
}> = ({ meeting, nodes, ownersById, onClose, onSaveNotes }) => {
  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex flex-col p-4 md:p-8" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl w-full h-full flex flex-col">
        <header className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-2xl font-bold text-blue-600">{meeting.title}</h2>
            <p className="text-sm text-gray-500">{meeting.time}</p>
          </div>
          <div className="flex items-center gap-4">
             <a href={meeting.url} target="_blank" rel="noopener noreferrer" className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2">
                <TeamsIcon /> Lanzar Reunión
             </a>
             <button onClick={onClose} className="p-2 text-gray-600 hover:text-red-700 rounded-full hover:bg-gray-100 self-start">
                <CloseIcon />
             </button>
          </div>
        </header>
        <div className="flex-grow flex flex-col md:flex-row gap-4 p-4 overflow-hidden">
            {/* Left Column: Agenda */}
            <div className="w-full md:w-1/2 flex flex-col min-h-0">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Agenda / Tareas</h3>
                <div className="flex-grow border rounded-lg p-2 overflow-y-auto bg-gray-50">
                    <ul className="space-y-3">
                        {nodes.map(node => (
                            <li key={node.id}>
                                <div className="font-semibold text-gray-800">{node.text}</div>
                                {node.subtasks.length > 0 && (
                                    <ul className="pl-4 mt-1 space-y-1">
                                        {node.subtasks.map(subtask => (
                                            <li key={subtask.id} className="flex items-center text-sm text-gray-600">
                                                <input type="checkbox" checked={subtask.completed} readOnly className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 mr-2 flex-shrink-0" />
                                                <span className={`${subtask.completed ? 'line-through text-gray-400' : ''}`}>{subtask.text}</span>
                                                <div className="ml-auto flex items-center pl-2 flex-shrink-0">
                                                    {subtask.ownerIds.map(oid => ownersById.get(oid)).filter(Boolean).map(owner => (
                                                        <img key={owner!.id} src={owner!.imageUrl} alt={owner!.name} title={owner!.name} className="w-4 h-4 rounded-full border border-white -ml-1" />
                                                    ))}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            {/* Right Column: Notes */}
            <div className="w-full md:w-1/2 flex flex-col min-h-0">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Notas de la reunión</h3>
                <NotesEditor 
                    content={meeting.notes} 
                    onChange={(content) => onSaveNotes(meeting.id, content)} 
                    placeholder="Escribe aquí las notas de la reunión..." 
                />
            </div>
        </div>
      </div>
    </div>
  );
};


const ImageViewerModal: React.FC<{ link: Link; onClose: () => void; }> = ({ link, onClose }) => {
  if (!link || !link.imageData) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-2xl p-4 relative max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-gray-800">{link.title || 'Imagen adjunta'}</h3>
             <button onClick={onClose} className="text-gray-500 hover:text-red-600" aria-label="Cerrar visor de imagen"><CloseIcon /></button>
        </div>
        <div className="overflow-auto max-h-[calc(90vh-100px)]">
            <img src={link.imageData} alt={link.title || 'Imagen adjunta'} className="w-full h-auto object-contain" />
        </div>
        {link.url && <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-red-600 hover:underline mt-2 inline-block">Ver original</a>}
      </div>
    </div>
  );
};


// --- COMPONENTE PRINCIPAL DE LA APP ---
const App: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([
    { id: 1, text: 'Proyecto Principal', x: 50, y: 50, width: 220, height: BASE_NODE_HEIGHT, parentId: null, links: [], notes: '', subtasks: [], tags: [], ownerIds: [], priority: 0, meetingIds: [] }
  ]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isAddOwnerModalOpen, setAddOwnerModalOpen] = useState(false);
  const [isAddMeetingModalOpen, setAddMeetingModalOpen] = useState(false);
  const [browserLink, setBrowserLink] = useState<Link | null>(null);
  const [addLinkModalState, setAddLinkModalState] = useState<AddLinkModalState>({ isOpen: false, nodeId: null });
  const [addImageModalState, setAddImageModalState] = useState<AddImageModalState>({ isOpen: false, nodeId: null });
  const [activeNotesNodeId, setActiveNotesNodeId] = useState<number | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<number | null>(null);
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [filterByNodeId, setFilterByNodeId] = useState<number | null>(null);
  const [filterByMeetingId, setFilterByMeetingId] = useState<number | null>(null);
  const [meetingViewMeetingId, setMeetingViewMeetingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [previewImage, setPreviewImage] = useState<{ src: string, top: number, left: number } | null>(null);
  const [viewingImageLink, setViewingImageLink] = useState<Link | null>(null);
  const [reparentingNodeId, setReparentingNodeId] = useState<number | null>(null);
  
  const draggingInfo = useRef<{ id: number | null; offsetX: number; offsetY: number; isDragging: boolean }>({ id: null, offsetX: 0, offsetY: 0, isDragging: false });
  const panningInfo = useRef({ isPanning: false, startX: 0, startY: 0, startViewX: 0, startViewY: 0 });
  const mapRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const ownersById = useMemo(() => new Map<number, Owner>(owners.map(owner => [owner.id, owner])), [owners]);
  const meetingsById = useMemo(() => new Map<number, Meeting>(meetings.map(meeting => [meeting.id, meeting])), [meetings]);
  
  const calculateNodeHeight = useCallback((node: Node) => {
      let height = BASE_NODE_HEIGHT;
      height += node.subtasks.length * SUBTASK_HEIGHT;
      height += METADATA_ROW_HEIGHT; // for owners/tags and actions row
      if (node.links.length > 0) {
        height += LINK_ROW_EXTRA_HEIGHT;
      }
      return height;
  }, []);
  
  const displayedNodes = useMemo(() => {
    const nodesWithHeights = nodes.map(n => ({...n, height: calculateNodeHeight(n)}));
    const nodesById = new Map<number, Node>(nodesWithHeights.map(n => [n.id, n]));
    
    let visibleNodes = nodesWithHeights;
    const activeFilter = searchQuery.trim().toLowerCase();
    const isPriorityFilterActive = priorityFilter !== null && priorityFilter > 0;
    
    if (filterByMeetingId || filterByNodeId || isPriorityFilterActive || activeFilter) {
        const visibleIds = new Set<number>();
        const addNodeAndAncestors = (nodeId: number) => {
            let current = nodesById.get(nodeId);
            while (current) {
                if (visibleIds.has(current.id)) break;
                visibleIds.add(current.id);
                current = current.parentId ? nodesById.get(current.parentId) : undefined;
            }
        };

        if (filterByMeetingId) {
             nodesWithHeights.forEach(node => {
                if (node.meetingIds.includes(filterByMeetingId)) {
                    addNodeAndAncestors(node.id);
                }
            });
        } else if (filterByNodeId) {
            const getAncestors = (nodeId: number) => {
                let current = nodesById.get(nodeId);
                while (current) {
                    visibleIds.add(current.id);
                    current = current.parentId ? nodesById.get(current.parentId) : undefined;
                }
            };
            const getDescendants = (nodeId: number) => {
                visibleIds.add(nodeId);
                const children = nodesWithHeights.filter(n => n.parentId === nodeId);
                children.forEach(child => getDescendants(child.id));
            };

            getAncestors(filterByNodeId);
            getDescendants(filterByNodeId);
        } else if (isPriorityFilterActive) {
            nodesWithHeights.forEach(node => {
                if (node.priority === priorityFilter) {
                    addNodeAndAncestors(node.id);
                }
            });
        } else if (activeFilter) {
            const tempDiv = document.createElement('div');
            nodesWithHeights.forEach(node => {
                tempDiv.innerHTML = node.notes;
                const notesText = tempDiv.textContent || "";
                const ownerNames = node.ownerIds.map(id => ownersById.get(id)?.name || '').join(' ').toLowerCase();

                const isMatch = node.text.toLowerCase().includes(activeFilter) ||
                                notesText.toLowerCase().includes(activeFilter) ||
                                node.tags.some(t => t.toLowerCase().includes(activeFilter)) ||
                                node.subtasks.some(st => st.text.toLowerCase().includes(activeFilter)) ||
                                ownerNames.includes(activeFilter);
                
                if (isMatch) {
                    addNodeAndAncestors(node.id);
                }
            });
        }
        visibleNodes = nodesWithHeights.filter(n => visibleIds.has(n.id));
    }
    
    return layoutTree(visibleNodes);
  }, [searchQuery, priorityFilter, filterByNodeId, filterByMeetingId, nodes, calculateNodeHeight, ownersById]);


  const displayedNodesById = useMemo(() => {
    const map = new Map<number, Node>();
    displayedNodes.forEach(node => map.set(node.id, node));
    return map;
  }, [displayedNodes]);


  const handleAddNode = (parentId: number | null = null) => {
    const newNode: Node = {
      id: Date.now(),
      text: "Nueva Tarea", x: 0, y: 0, width: 220, height: BASE_NODE_HEIGHT,
      parentId, links: [], notes: '', subtasks: [], tags:[], ownerIds:[], priority: 0, isEditing: true, meetingIds: [],
    };
    setNodes(prev => [...prev, newNode]);
  };
  
  const handleUpdateNodeText = (nodeId: number, text: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, text: text || 'Nueva Tarea', isEditing: false } : n ));
  };

  const handleToggleEdit = (nodeId: number) => {
      setNodes(prev => prev.map(n => ({...n, isEditing: n.id === nodeId})));
  };
  
  const handleAddLink = (nodeId: number) => setAddLinkModalState({ isOpen: true, nodeId });
  const handleAddImage = (nodeId: number) => setAddImageModalState({ isOpen: true, nodeId });
  
  const handleRemoveLink = (nodeId: number, linkId: number) => {
      setNodes(prev => prev.map(n => n.id === nodeId ? {...n, links: n.links.filter(l => l.id !== linkId)} : n));
  };
    
  const handleSaveLink = (nodeId: number, title: string, url: string, type: LinkType, desktopUrl: string) => {
      setNodes(nodes.map(node =>
        node.id === nodeId
          ? { ...node, links: [...node.links, { id: Date.now(), title, url, type, desktopUrl }] }
          : node
      ));
      setAddLinkModalState({ isOpen: false, nodeId: null });
  };

    const handleSaveImage = (nodeId: number, title: string, url: string, imageData: string) => {
        const newLink: Link = { id: Date.now(), title, url, imageData, type: 'image' };
        setNodes(prev => prev.map(n => n.id === nodeId ? {...n, links: [...n.links, newLink]} : n));
        setAddImageModalState({ isOpen: false, nodeId: null });
    };

  const handleUpdateNodeNotes = (nodeId: number, notes: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, notes } : n));
  };

  const handleAddSubtask = (nodeId: number) => {
    const newSubtask: Subtask = { id: Date.now(), text: "", completed: false, isEditing: true, ownerIds: [] };
    setNodes(prev => prev.map(n => n.id === nodeId 
        ? { ...n, subtasks: n.subtasks.map(st => ({...st, isEditing: false})).concat(newSubtask) } : n
    ));
  };
  
  const handleUpdateSubtaskText = (nodeId: number, subtaskId: number, text: string) => {
      setNodes(prev => prev.map(n => {
          if (n.id !== nodeId) return n;
          const newSubtasks = n.subtasks.map(st => 
              st.id === subtaskId ? {...st, text: text || 'Nueva Subtarea', isEditing: false} : st
          );
          return { ...n, subtasks: newSubtasks };
      }));
  };

  const handleToggleSubtask = (nodeId: number, subtaskId: number) => {
      setNodes(prev => prev.map(n => n.id === nodeId 
          ? { ...n, subtasks: n.subtasks.map(st => st.id === subtaskId ? {...st, completed: !st.completed} : st)}
          : n
      ));
  };

  const handleSetSubtaskEditing = (nodeId: number, subtaskId: number) => {
    setNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n;
        return { ...n, subtasks: n.subtasks.map(st => ({ ...st, isEditing: st.id === subtaskId })) };
    }));
  };

    const handleAssignOwnerToSubtask = (nodeId: number, subtaskId: number, ownerId: number) => {
        setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            subtasks: n.subtasks.map(st => st.id === subtaskId && !st.ownerIds.includes(ownerId) ? { ...st, ownerIds: [...st.ownerIds, ownerId] } : st)
        } : n));
    };

    const handleRemoveOwnerFromSubtask = (nodeId: number, subtaskId: number, ownerId: number) => {
        setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            subtasks: n.subtasks.map(st => st.id === subtaskId ? { ...st, ownerIds: st.ownerIds.filter(id => id !== ownerId) } : st)
        } : n));
    };

    const handleReorderSubtasks = (nodeId: number, dragId: number, dropId: number) => {
        if (dragId === dropId) return;
        setNodes(prev => prev.map(n => {
            if (n.id !== nodeId) return n;
            const subs = [...n.subtasks];
            const dragIndex = subs.findIndex(s => s.id === dragId);
            const dropIndex = subs.findIndex(s => s.id === dropId);
            if (dragIndex === -1 || dropIndex === -1) return n;

            const [removed] = subs.splice(dragIndex, 1);
            subs.splice(dropIndex, 0, removed);
            return { ...n, subtasks: subs };
        }));
    };
  
  const handleOpenNotes = (nodeId: number) => { setBrowserLink(null); setActiveNotesNodeId(nodeId); };
  
  const handleOpenLink = (link: Link) => {
      setActiveNotesNodeId(null);
      if (link.type !== 'image' && link.url) {
          setBrowserLink(link);
      } else if (link.desktopUrl) {
          window.open(link.desktopUrl, '_self');
      }
  };

    const handleSetReparentingMode = (nodeId: number) => {
        setReparentingNodeId(prev => (prev === nodeId ? null : nodeId));
    };

    const handleNodeClick = (clickedNodeId: number) => {
        if (!reparentingNodeId) return;

        if (reparentingNodeId === clickedNodeId) {
            setReparentingNodeId(null); // Cancel by clicking the same node
            return;
        }

        // Check for cycles
        const nodesById = new Map(nodes.map(n => [n.id, n]));
        let p: Node | undefined = nodesById.get(clickedNodeId);
        let isCycle = false;
        while (p) {
            if (p.id === reparentingNodeId) {
                isCycle = true;
                break;
            }
            p = p.parentId ? nodesById.get(p.parentId) : undefined;
        }

        if (!isCycle) {
            setNodes(prev => prev.map(n =>
                n.id === reparentingNodeId
                ? { ...n, parentId: clickedNodeId }
                : n
            ));
        } else {
            alert("Operación no permitida: no se puede mover un nodo a uno de sus propios descendientes.");
        }

        setReparentingNodeId(null);
    };

  
  const handleMapMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reparentingNodeId) {
      setReparentingNodeId(null);
      return;
    }
    if (e.target === mapRef.current) {
        e.preventDefault();
        panningInfo.current = { isPanning: true, startX: e.clientX, startY: e.clientY, startViewX: viewTransform.x, startViewY: viewTransform.y };
        mapRef.current!.style.cursor = 'grabbing';
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, nodeId: number) => {
    if (reparentingNodeId || (e.target as HTMLElement).closest('button, textarea, input, select, a')) return;
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !mapRef.current) return;
    
    draggingInfo.current = {
        id: nodeId,
        offsetX: (e.clientX - viewTransform.x) / viewTransform.zoom - node.x,
        offsetY: (e.clientY - viewTransform.y) / viewTransform.zoom - node.y,
        isDragging: true
    };
    
    const el = document.getElementById(`node-${nodeId}`);
    if(el) { el.style.cursor = 'grabbing'; el.style.zIndex = '20'; el.style.transition = 'none'; }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingInfo.current.isDragging && draggingInfo.current.id !== null) {
      const worldX = (e.clientX - viewTransform.x) / viewTransform.zoom;
      const worldY = (e.clientY - viewTransform.y) / viewTransform.zoom;
      const newX = worldX - draggingInfo.current.offsetX;
      const newY = worldY - draggingInfo.current.offsetY;

      setNodes(prevNodes => prevNodes.map(node => 
        node.id === draggingInfo.current.id ? { ...node, x: newX, y: newY } : node
      ));
    } else if (panningInfo.current.isPanning) {
        const dx = e.clientX - panningInfo.current.startX;
        const dy = e.clientY - panningInfo.current.startY;
        setViewTransform(prev => ({ 
            ...prev,
            x: panningInfo.current.startViewX + dx, 
            y: panningInfo.current.startViewY + dy 
        }));
    }
  }, [viewTransform.x, viewTransform.y, viewTransform.zoom]);

  const handleMouseUp = useCallback(() => {
    const draggedNodeId = draggingInfo.current.id;
    if (draggedNodeId !== null && draggingInfo.current.isDragging) {
        const el = document.getElementById(`node-${draggedNodeId}`);
        if(el) { 
            el.style.cursor = 'grab'; 
            el.style.zIndex = '10'; 
            el.style.transition = 'left 0.3s ease, top 0.3s ease, right 0.3s ease, bottom 0.3s ease'; 
        }
    }
    
    if (panningInfo.current.isPanning) {
        panningInfo.current.isPanning = false;
        if(mapRef.current) { mapRef.current.style.cursor = 'grab'; }
    }
    draggingInfo.current = { id: null, offsetX: 0, offsetY: 0, isDragging: false };
}, []);
  
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if(reparentingNodeId) return;
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? viewTransform.zoom * zoomFactor : viewTransform.zoom / zoomFactor;
    const clampedZoom = Math.max(0.2, Math.min(newZoom, 2.5));

    const rect = mapRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const pointX = (mouseX - viewTransform.x) / viewTransform.zoom;
    const pointY = (mouseY - viewTransform.y) / viewTransform.zoom;
    
    const newX = mouseX - pointX * clampedZoom;
    const newY = mouseY - pointY * clampedZoom;

    setViewTransform({ x: newX, y: newY, zoom: clampedZoom });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setReparentingNodeId(null);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleAddTag = (nodeId: number, tag: string) => {
      setNodes(prev => prev.map(n => n.id === nodeId && !n.tags.includes(tag) ? {...n, tags: [...n.tags, tag]} : n));
  };
  const handleRemoveTag = (nodeId: number, tagIndex: number) => {
      setNodes(prev => prev.map(n => n.id === nodeId ? {...n, tags: n.tags.filter((_, i) => i !== tagIndex)} : n));
  };
  const handleAssignOwner = (nodeId: number, ownerId: number) => {
      setNodes(prev => prev.map(n => n.id === nodeId && !n.ownerIds.includes(ownerId) ? {...n, ownerIds: [...n.ownerIds, ownerId]} : n));
  };
  const handleRemoveOwner = (nodeId: number, ownerIdToRemove: number) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? {...n, ownerIds: n.ownerIds.filter(id => id !== ownerIdToRemove)} : n));
  };
  const handleAssignMeeting = (nodeId: number, meetingId: number) => {
      setNodes(prev => prev.map(n => n.id === nodeId && !n.meetingIds.includes(meetingId) ? {...n, meetingIds: [...n.meetingIds, meetingId]} : n));
  };
  const handleRemoveMeeting = (nodeId: number, meetingIdToRemove: number) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? {...n, meetingIds: n.meetingIds.filter(id => id !== meetingIdToRemove)} : n));
  };
  const handleCyclePriority = (nodeId: number) => {
      setNodes(prev => prev.map(n => n.id === nodeId ? {...n, priority: ((n.priority + 1) % 4) as Priority} : n));
  };

  const handleSaveOwner = (name: string, imageUrl: string, teamsUrl: string) => {
      const newOwner: Owner = { id: Date.now(), name, imageUrl, teamsUrl };
      setOwners(prev => [...prev, newOwner]);
      setAddOwnerModalOpen(false);
  };
    
  const handleSaveMeeting = (title: string, time: string, url: string) => {
      const newMeeting: Meeting = { id: Date.now(), title, time, url, notes: '' };
      setMeetings(prev => [...prev, newMeeting]);
      setAddMeetingModalOpen(false);
  };
  
  const handleUpdateMeetingNotes = (meetingId: number, notes: string) => {
      setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, notes } : m));
  };

  const handleTextFilterClick = (query: string) => {
      setPriorityFilter(0);
      setFilterByNodeId(null);
      setFilterByMeetingId(null);
      setSearchQuery(prev => prev === query ? '' : query);
  };
  const handlePriorityFilterClick = (priority: Priority) => {
      setSearchQuery('');
      setFilterByNodeId(null);
      setFilterByMeetingId(null);
      setPriorityFilter(prev => prev === priority ? 0 : priority);
  };
  const handleSetNodeFilter = (nodeId: number | null) => {
    setSearchQuery('');
    setPriorityFilter(0);
    setFilterByMeetingId(null);
    setFilterByNodeId(nodeId);
  }
  const handleFilterByMeeting = (meetingId: number | null) => {
      setSearchQuery('');
      setPriorityFilter(0);
      setFilterByNodeId(null);
      setFilterByMeetingId(prev => prev === meetingId ? null : meetingId);
  };

  const handleExport = () => {
    const dataToExport = { nodes, owners, meetings };
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `santander-mind-map-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const data = JSON.parse(text);
            if (data.nodes && Array.isArray(data.nodes) && data.owners && Array.isArray(data.owners)) {
                const sanitizedNodes: Node[] = (data.nodes as any[]).map((node, index): Node => {
                    // FIX: Explicitly type safeNode as Partial<Node> and check for null.
                    // This prevents a TypeScript error when node is not an object, and a runtime error if node is null.
                    const safeNode: Partial<Node> = (node && typeof node === 'object' && node !== null) ? node : {};
                    return {
                        id: safeNode.id || Date.now() + index,
                        text: safeNode.text || "Untitled Node",
                        x: safeNode.x || 0,
                        y: safeNode.y || 0,
                        width: safeNode.width || 220,
                        height: safeNode.height || BASE_NODE_HEIGHT,
                        parentId: safeNode.parentId !== undefined ? safeNode.parentId : null,
                        links: safeNode.links || [],
                        notes: safeNode.notes || '',
                        subtasks: safeNode.subtasks || [],
                        tags: safeNode.tags || [],
                        ownerIds: safeNode.ownerIds || [],
                        priority: safeNode.priority || 0,
                        meetingIds: safeNode.meetingIds || [],
                        isEditing: safeNode.isEditing || false,
                    };
                });

                setNodes(sanitizedNodes);
                setOwners(data.owners);
                if (data.meetings && Array.isArray(data.meetings)) {
                     const sanitizedMeetings = data.meetings.map(m => ({
                        id: m.id || Date.now(),
                        title: m.title || '',
                        time: m.time || '',
                        url: m.url || '',
                        notes: m.notes || ''
                    }));
                    setMeetings(sanitizedMeetings);
                } else {
                    setMeetings([]);
                }
            } else {
                alert('Formato de archivo inválido.');
            }
        } catch (error) {
            console.error("Error al importar el archivo:", error);
            alert('Error al leer el archivo JSON.');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset para poder importar el mismo archivo de nuevo
  };
  
  const allTags = useMemo(() => [...new Set(nodes.flatMap(n => n.tags))], [nodes]);

  const focusedNode = displayedNodes.find(n => n.id === focusedNodeId);
  const activeNotesNode = displayedNodes.find(n => n.id === activeNotesNodeId);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden">
        <header className="flex justify-between items-center p-3 border-b bg-white shadow-sm z-30">
            <div className="flex items-center">
                <h1 className="text-xl font-bold text-red-600 mr-6">Santander Mind Map</h1>
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="Buscar en tareas, notas, tags..." value={searchQuery} onChange={e => handleTextFilterClick(e.target.value)} className="w-80 pl-10 pr-4 py-1.5 border border-gray-300 rounded-full text-sm focus:ring-red-500 focus:border-red-500" />
                </div>
            </div>
            <div className="flex items-center space-x-2">
                <div className="flex items-center p-0.5 bg-gray-100 rounded-lg">
                    <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md ${viewMode === 'map' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`} title="Vista de Mapa"><MapViewIcon /></button>
                    <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`} title="Vista de Lista"><ListViewIcon /></button>
                </div>
                <div className="w-px h-6 bg-gray-200"></div>
                <button onClick={handleImportClick} className="text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 py-1.5 px-3 rounded-md transition-colors">Importar</button>
                <input type="file" ref={importFileRef} onChange={handleImportFile} accept=".json" className="hidden" />
                <button onClick={handleExport} className="text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 py-1.5 px-3 rounded-md transition-colors">Exportar</button>
                <button onClick={() => handleAddNode()} className="bg-red-600 text-white font-bold py-1.5 px-3 rounded-md hover:bg-red-700 transition-colors text-sm">+ Nueva Tarea</button>
            </div>
        </header>

        <div className="p-3 border-b bg-white z-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-600">Owners:</span>
                        {owners.map(owner => (
                            <div key={owner.id} onDragStart={(e) => e.dataTransfer.setData("application/owner-id", owner.id.toString())} draggable className="cursor-grab">
                                <img src={owner.imageUrl} alt={owner.name} title={owner.name} className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />
                            </div>
                        ))}
                        <button onClick={() => setAddOwnerModalOpen(true)} className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300" title="Añadir Owner">+</button>
                    </div>
                     <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-600">Reuniones:</span>
                         {[...meetings]
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map(meeting => (
                                <button 
                                    key={meeting.id} 
                                    onClick={() => handleFilterByMeeting(meeting.id)}
                                    onDragStart={(e) => e.dataTransfer.setData("application/meeting-id", meeting.id.toString())} 
                                    draggable 
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-colors cursor-grab
                                        ${filterByMeetingId === meeting.id 
                                            ? 'bg-blue-600 text-white ring-2 ring-blue-300' 
                                            : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                        }`
                                    }
                                    title={meeting.title}
                                >
                                    <CalendarIcon />
                                    <span className="font-semibold">{meeting.time}</span>
                                    <span className="truncate max-w-28">{meeting.title}</span>
                                </button>
                            ))
                        }
                        <button onClick={() => setAddMeetingModalOpen(true)} className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300" title="Añadir Reunión">+</button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                     <span className="text-sm font-semibold text-gray-600 mr-2">Prioridades:</span>
                    {[1,2,3].map(p => {
                        const priority = p as Priority;
                        return (
                            <button key={priority} onClick={() => handlePriorityFilterClick(priority)}
                                className={`px-3 py-1 text-xs font-bold rounded-full border-2 ${priorityFilter === priority ? `${PRIORITY_STYLES[priority].bg} ${PRIORITY_STYLES[priority].text} border-transparent` : 'bg-white border-gray-300 hover:border-red-400'}`}>
                                {PRIORITY_STYLES[priority].label}
                            </button>
                        );
                    })}
                </div>
            </div>
             {allTags.length > 0 && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                    <span className="text-sm font-semibold text-gray-600 mr-2">Tags:</span>
                    {allTags.map(tag => (
                        <button key={tag} onClick={() => handleTextFilterClick(tag)} onDragStart={(e) => e.dataTransfer.setData("application/tag-name", tag)} draggable
                         className={`px-2 py-0.5 text-xs rounded-full ${searchQuery === tag ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>
                            {tag}
                        </button>
                    ))}
                </div>
             )}
        </div>
        {filterByNodeId && (
            <div className="flex items-center justify-center p-2 bg-yellow-100 text-yellow-800 text-sm font-medium z-20">
                <FilterIcon className="mr-2"/>
                <span>Filtrando por: <strong className="font-semibold">{nodes.find(n => n.id === filterByNodeId)?.text}</strong></span>
                <button onClick={() => handleSetNodeFilter(null)} className="ml-4 font-semibold text-yellow-900 hover:underline">Limpiar Filtro</button>
            </div>
        )}
        {filterByMeetingId && meetingsById.has(filterByMeetingId) && (
            <div className="flex items-center justify-center gap-4 p-2 bg-blue-100 text-blue-800 text-sm font-medium z-20">
                <CalendarIcon className="w-5 h-5"/>
                <span>Filtrando por Reunión: <strong className="font-semibold">{meetingsById.get(filterByMeetingId)?.title}</strong></span>
                <div className="w-px h-4 bg-blue-300"></div>
                <button onClick={() => setMeetingViewMeetingId(filterByMeetingId)} className="font-semibold text-blue-900 hover:underline">Abrir Vista de Reunión</button>
                <button onClick={() => handleFilterByMeeting(null)} className="ml-2 font-semibold text-blue-900 hover:underline">Limpiar Filtro</button>
            </div>
        )}

        <main className="flex-grow bg-gray-100 relative overflow-hidden">
            {viewMode === 'map' ? (
                 <div className="h-full w-full" ref={mapRef} onMouseDown={handleMapMouseDown} onWheel={handleWheel} style={{ cursor: reparentingNodeId ? 'crosshair' : 'grab' }}>
                    <div className="absolute" style={{ transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.zoom})`, transformOrigin: '0 0' }}>
                        <svg className="absolute top-0 left-0 w-full h-full" style={{ width: '100vw', height: '100vh', pointerEvents: 'none' }}>
                            <defs>
                                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#CBD5E1" />
                                </marker>
                            </defs>
                            <g>
                                {displayedNodes.map(node => {
                                if (node.parentId === null || !displayedNodesById.has(node.parentId)) return null;
                                const parent = displayedNodesById.get(node.parentId)!;
                                const startX = parent.x + parent.width;
                                const startY = parent.y + parent.height / 2;
                                const endX = node.x;
                                const endY = node.y + node.height / 2;
                                const c1X = startX + H_SPACE / 2;
                                const c1Y = startY;
                                const c2X = endX - H_SPACE / 2;
                                const c2Y = endY;
                                return <path key={`${node.parentId}-${node.id}`} d={`M ${startX} ${startY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${endY}`} stroke="#CBD5E1" strokeWidth="2" fill="none" />;
                                })}
                            </g>
                        </svg>
                        
                        {displayedNodes.map(node => (
                            <NodeComponent 
                                key={node.id} node={node} ownersById={ownersById} meetingsById={meetingsById}
                                reparentingNodeId={reparentingNodeId}
                                onMouseDown={handleMouseDown}
                                onNodeClick={handleNodeClick}
                                onSetReparentingMode={handleSetReparentingMode}
                                onAddLink={handleAddLink} onAddImage={handleAddImage}
                                onRemoveLink={handleRemoveLink} onAddChild={() => handleAddNode(node.id)}
                                onOpenLink={handleOpenLink} onUpdateText={handleUpdateNodeText}
                                onToggleEdit={handleToggleEdit} onOpenNotes={handleOpenNotes} onOpenFocusView={setFocusedNodeId}
                                onAddSubtask={handleAddSubtask} onToggleSubtask={handleToggleSubtask}
                                onUpdateSubtaskText={handleUpdateSubtaskText} onSetSubtaskEditing={handleSetSubtaskEditing}
                                onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} onAssignOwner={handleAssignOwner} onAssignMeeting={handleAssignMeeting} onRemoveMeeting={handleRemoveMeeting} onCyclePriority={handleCyclePriority}
                                onSetNodeFilter={handleSetNodeFilter}
                                onShowImagePreview={(imageData, rect) => setPreviewImage({src: imageData, top: rect.bottom + 5, left: rect.left})}
                                onHideImagePreview={() => setPreviewImage(null)}
                                onOpenImageViewer={setViewingImageLink}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <ListView nodes={nodes} ownersById={ownersById} onSaveNotes={handleUpdateNodeNotes} />
            )}

            {previewImage && createPortal(
                <div style={{ position: 'fixed', top: previewImage.top, left: previewImage.left, zIndex: 100, pointerEvents: 'none' }} className="p-1 bg-white rounded-md shadow-lg border">
                    <img src={previewImage.src} style={{ maxWidth: '200px', maxHeight: '200px' }} alt="Preview" />
                </div>,
                document.body
            )}
            <ImageViewerModal link={viewingImageLink} onClose={() => setViewingImageLink(null)} />

          <SideBrowser link={browserLink} onClose={() => setBrowserLink(null)} />
          <SideNotesPanel node={activeNotesNode} onClose={() => setActiveNotesNodeId(null)} onSaveNotes={handleUpdateNodeNotes} />
          
          <AddOwnerModal isOpen={isAddOwnerModalOpen} onClose={() => setAddOwnerModalOpen(false)} onSave={handleSaveOwner} />
          <AddMeetingModal isOpen={isAddMeetingModalOpen} onClose={() => setAddMeetingModalOpen(false)} onSave={handleSaveMeeting} />
          <AddLinkModal modalState={addLinkModalState} onClose={() => setAddLinkModalState({ isOpen: false, nodeId: null })} onSave={handleSaveLink} />
          <AddImageModal modalState={addImageModalState} onClose={() => setAddImageModalState({ isOpen: false, nodeId: null })} onSave={handleSaveImage} />
          {focusedNode && <FocusView node={focusedNode} owners={owners} ownersById={ownersById} onClose={() => setFocusedNodeId(null)} onSaveNotes={handleUpdateNodeNotes} onUpdateText={handleUpdateNodeText} onAddSubtask={handleAddSubtask} onToggleSubtask={handleToggleSubtask} onUpdateSubtaskText={handleUpdateSubtaskText} onSetSubtaskEditing={handleSetSubtaskEditing} onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} onAssignOwner={handleAssignOwner} onRemoveOwner={handleRemoveOwner} onAddLink={handleAddLink} onRemoveLink={handleRemoveLink} onAssignOwnerToSubtask={handleAssignOwnerToSubtask} onRemoveOwnerFromSubtask={handleRemoveOwnerFromSubtask} onReorderSubtasks={handleReorderSubtasks} />}
          {meetingViewMeetingId && meetingsById.has(meetingViewMeetingId) && (
            <MeetingViewModal
                meeting={meetingsById.get(meetingViewMeetingId)!}
                nodes={nodes.filter(n => n.meetingIds.includes(meetingViewMeetingId))}
                ownersById={ownersById}
                onClose={() => setMeetingViewMeetingId(null)}
                onSaveNotes={handleUpdateMeetingNotes}
            />
          )}
        </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
