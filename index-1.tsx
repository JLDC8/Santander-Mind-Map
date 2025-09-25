
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as ReactDOM from 'react-dom/client';

// --- DEFINICIONES DE TIPOS ---
type LinkType = 'web' | 'outlook' | 'excel' | 'powerpoint' | 'teams';
type Priority = 0 | 1 | 2 | 3;

interface Link {
  id: number;
  url: string;
  title: string;
  type: LinkType;
  desktopUrl?: string;
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
  isEditing?: boolean;
}

interface AddLinkModalState {
  isOpen: boolean;
  nodeId: number | null;
}

// --- CONSTANTES ---
const BASE_NODE_HEIGHT = 60;
const SUBTASK_HEIGHT = 28;
const METADATA_ROW_HEIGHT = 40; // Fila unificada para owners y tags

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
const NotesIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>);
const ExpandIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5" /></svg>);
const MaximizeIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0015.5 2h-11zM5 5h10v10H5V5z" clipRule="evenodd" /></svg>);
const RestoreIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM11 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z" /></svg>);
const BoldIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 4h3.454c1.764 0 2.29.387 2.29 1.842 0 1.002-.69 1.43-1.34 1.565.81.163 1.55.73 1.55 1.77C15 10.74 14.15 12 12.015 12H9.05V4zm1.75 3.32h1.15c.65 0 .963-.26.963-.843 0-.585-.313-.842-.963-.842h-1.15v1.685zm0 2.97h1.43c.75 0 1.137-.3 1.137-.962 0-.663-.387-1.002-1.137-1.002h-1.43v1.964z" /></svg>);
const ItalicIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.75 4h5.5a.75.75 0 010 1.5h-1.42l-2.33 9h1.5a.75.75 0 010 1.5h-5.5a.75.75 0 010-1.5h1.42l2.33-9h-1.5a.75.75 0 010-1.5z" /></svg>);
const UnderlineIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 16h10a1 1 0 110 2H5a1 1 0 110-2zm1.5-13a1 1 0 011-1h5a1 1 0 110 2h-1.5v5a2.5 2.5 0 01-5 0V4H6.5a1 1 0 01-1-1zM8 4h4v5a1 1 0 11-2 0V4z" /></svg>);
const StrikethroughIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 10a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1z" clipRule="evenodd" /><path fillRule="evenodd" d="M9.47 4.164A1 1 0 0110.457 3h.51a1 1 0 01.976.783l1.5 5.5a1 1 0 01-.976 1.217H12a1 1 0 110-2h.438l-1.028-3.772a.5.5 0 00-.488-.395h-.51a.5.5 0 00-.489.395L8.562 8H9a1 1 0 110 2H7.467a1 1 0 01-.976-1.217l1.5-5.5a1 1 0 011.48-.62z" clipRule="evenodd" /></svg>);
const BulletListIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 7a2 2 0 11-4 0 2 2 0 014 0zm-2 4a2 2 0 100 4 2 2 0 000-4zm2 4a2 2 0 11-4 0 2 2 0 014 0zm4-8a1 1 0 100-2h8a1 1 0 100 2H9zm0 4a1 1 0 100-2h8a1 1 0 100 2H9zm0 4a1 1 0 100-2h8a1 1 0 100 2H9z" clipRule="evenodd" /></svg>);
const NumberedListIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 4.5a.5.5 0 01.5-.5h.5a.5.5 0 01.5.5v.5h-.5a.5.5 0 01-.5-.5V4.5zM3 3.5a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h.5a.5.5 0 00.5-.5V4a.5.5 0 00-.5-.5H3zM2 9.5a.5.5 0 01.5-.5h.5a.5.5 0 01.5.5v.5h-.5a.5.5 0 01-.5-.5V9.5zM3 8.5a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h.5a.5.5 0 00.5-.5V9a.5.5 0 00-.5-.5H3zm-1 5a.5.5 0 01.5-.5h.5a.5.5 0 01.5.5v.5h-.5a.5.5 0 01-.5-.5v-.5zM3 13.5a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5h.5a.5.5 0 00.5-.5v-.5a.5.5 0 00-.5-.5H3z" clipRule="evenodd"/><path fillRule="evenodd" d="M7 5a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></svg>);
{/* FIX: Accept className prop to allow custom styling */}
const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 ${className || ''}`.trim()} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>);
const OpenInNewIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>);
const DesktopAppIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>);
{/* FIX: Accept className prop to allow custom styling */}
const FilterIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${className || ''}`.trim()} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" /></svg>);


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

const SideBrowser: React.FC<{ link: Link | null; onClose: () => void }> = ({ link, onClose }) => {
    if (!link) return null;
    return (
        <div className="absolute top-0 right-0 h-full w-full md:w-1/2 lg:w-2/5 bg-white shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out" style={{transform: link ? 'translateX(0%)' : 'translateX(100%)'}}>
            <div className="flex justify-between items-center p-3 border-b border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 truncate ml-2 flex-grow">{link.title}</p>
                 <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {link.desktopUrl && (
                        <a href={link.desktopUrl} target="_blank" rel="noopener noreferrer" title="Abrir en App de Escritorio" className="p-1.5 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-200 transition-colors">
                            <DesktopAppIcon />
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

    const webLinks = node.links.filter(link => link.url);
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
                                            <DesktopAppIcon />
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
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>, nodeId: number) => void;
  onAddLink: (nodeId: number) => void;
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
  onCyclePriority: (nodeId: number) => void;
  onSetNodeFilter: (nodeId: number) => void;
}> = (props) => {
  const { node, ownersById, onMouseDown, onAddLink, onRemoveLink, onAddChild, onOpenLink, onUpdateText, onToggleEdit, onOpenNotes, onOpenFocusView, onAddSubtask, onToggleSubtask, onUpdateSubtaskText, onSetSubtaskEditing, onAddTag, onRemoveTag, onAssignOwner, onCyclePriority, onSetNodeFilter } = props;
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
      if (ownerId) {
          onAssignOwner(node.id, parseInt(ownerId, 10));
      } else if (tagName) {
          onAddTag(node.id, tagName);
      }
  };

  const LinkTypeIcon: React.FC<{type: LinkType}> = ({type}) => {
      switch (type) {
          case 'outlook': return <OutlookIcon />;
          case 'excel': return <ExcelIcon />;
          case 'powerpoint': return <PowerPointIcon />;
          case 'teams': return <TeamsIcon />;
          default: return <WebIcon />;
      }
  };

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

  return (
    <div
      id={`node-${node.id}`}
      className={`absolute bg-white border-2 border-gray-200 rounded-lg shadow-md p-3 cursor-grab flex flex-col transition-all duration-300 hover:shadow-xl hover:border-red-500 z-10`}
      style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}
      onMouseDown={(e) => onMouseDown(e, node.id)} onDoubleClick={() => onToggleEdit(node.id)}
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
         <div className="mt-2 pt-2 border-t border