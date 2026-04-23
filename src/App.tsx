import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, 
  FileText, 
  Download, 
  Trash2, 
  UploadCloud, 
  Filter, 
  MoreVertical, 
  User, 
  File, 
  Image as ImageIcon, 
  Shield, 
  GraduationCap, 
  Stethoscope, 
  X,
  LayoutDashboard,
  LogOut,
  FileUp,
  Link as LinkIcon,
  Menu,
  Printer,
  Maximize2,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, storage } from './lib/firebase';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { ref, push, set, onValue, remove } from 'firebase/database';
import { ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { PDFDocument } from 'pdf-lib';
import jsPDF from 'jspdf';
import confetti from 'canvas-confetti';
import Auth from './components/Auth';

// --- Types ---
type Category = string;

interface DocumentData {
  id: string;
  name: string;
  date: string;
  category: Category;
  size: string;
  type: string;
  downloadURL: string;
  storagePath: string;
  createdAt?: string;
}

const DEFAULT_CATEGORIES: Category[] = ['ID Cards', 'Marksheets', 'A4 Documents', 'Medical', 'Custom'];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [userCategories, setUserCategories] = useState<Category[]>(['ID Cards', 'Marksheets', 'A4 Documents', 'Medical']);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fullscreenDoc, setFullscreenDoc] = useState<DocumentData | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  
  // Upload Flow States
  const [uploadCategory, setUploadCategory] = useState<Category | ''>('');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Monitor Realtime Database for User Documents and Categories
  useEffect(() => {
    if (!user) {
      setDocuments([]);
      setUserCategories(['ID Cards', 'Marksheets', 'A4 Documents', 'Medical']);
      return;
    }

    // Docs Listener
    const docsRef = ref(db, `users/${user.uid}/documents`);
    const unsubscribeDocs = onValue(docsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedDocs: DocumentData[] = Object.entries(data).map(([id, doc]: [string, any]) => ({
          id,
          ...doc
        }));
        setDocuments(loadedDocs.reverse()); // Newest first
      } else {
        setDocuments([]);
      }
    });

    // Categories Listener
    const categoriesRef = ref(db, `users/${user.uid}/categories`);
    const unsubscribeCats = onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Array.isArray(data)) {
        // Filter out "Custom" and "All" if they were somehow added, and merge with defaults
        const existing = new Set(['ID Cards', 'Marksheets', 'A4 Documents', 'Medical']);
        const custom = data.filter(c => !existing.has(c));
        setUserCategories(['ID Cards', 'Marksheets', 'A4 Documents', 'Medical', ...custom]);
      } else {
        setUserCategories(['ID Cards', 'Marksheets', 'A4 Documents', 'Medical']);
      }
    });

    return () => {
      unsubscribeDocs();
      unsubscribeCats();
    };
  }, [user]);

  // --- Logic ---
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [documents, searchQuery, selectedCategory]);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const performUpload = async () => {
    if (!selectedFile || !uploadCategory || !user) return;
    
    let finalCategory = uploadCategory;
    if (uploadCategory === 'Custom') {
      if (!customCategoryName.trim()) {
        alert('Please enter a custom category name');
        return;
      }
      finalCategory = customCategoryName.trim();
    }

    setIsUploading(true);
    setUploadProgress(0);

    const fileName = `${Date.now()}_${selectedFile.name}`;
    const storageRef = sRef(storage, `users/${user.uid}/documents/${fileName}`);
    const uploadTask = uploadBytesResumable(storageRef, selectedFile);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      },
      (error) => {
        console.error("Upload error:", error);
        alert(error.message);
        setIsUploading(false);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // Save metadata to Realtime Database
          const docsRef = ref(db, `users/${user.uid}/documents`);
          const newDocRef = push(docsRef);
          
          const now = new Date();
          const day = now.getDate().toString().padStart(2, '0');
          const month = (now.getMonth() + 1).toString().padStart(2, '0');
          const formattedDate = `${day}/${month}/${now.getFullYear()}`;

          await set(newDocRef, {
            name: selectedFile.name,
            date: formattedDate,
            category: finalCategory,
            size: `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`,
            type: selectedFile.name.split('.').pop() || 'unknown',
            downloadURL,
            storagePath: `users/${user.uid}/documents/${fileName}`,
            createdAt: now.toISOString()
          });

          // If it was a new custom category, add it to user's categories list
          if (uploadCategory === 'Custom') {
            const currentCustoms = userCategories.filter(c => !['ID Cards', 'Marksheets', 'A4 Documents', 'Medical'].includes(c));
            if (!currentCustoms.includes(finalCategory)) {
                const updatedCustoms = [...currentCustoms, finalCategory];
                await set(ref(db, `users/${user.uid}/categories`), updatedCustoms);
            }
          }

          // Reset flow
          setIsUploading(false);
          setSelectedFile(null);
          setUploadCategory('');
          setCustomCategoryName('');
          if (fileInputRef.current) fileInputRef.current.value = '';
          setIsSidebarOpen(false); // Close sidebar on upload complete for mobile
        } catch (err: any) {
          alert('Error saving to database: ' + err.message);
          setIsUploading(false);
        }
      }
    );
  };

  const deleteDocument = async (id: string, storagePath?: string) => {
    if (!user) return;
    try {
      if (storagePath) {
        const fileRef = sRef(storage, storagePath);
        await deleteObject(fileRef).catch(err => {
            console.warn("Storage item already gone or access denied", err);
        });
      }
      await remove(ref(db, `users/${user.uid}/documents/${id}`));
    } catch (err: any) {
      alert("Error deleting document: " + err.message);
    }
  };

  const handlePrintSelection = async () => {
    if (selectedIds.size === 0) return;
    
    setIsUploading(true);
    setUploadProgress(5);

    try {
      const mergedPdf = await PDFDocument.create();
      const ids = Array.from(selectedIds);
      let successCount = 0;
      let failedFiles: string[] = [];
      
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const docData = documents.find(d => d.id === id);
        if (!docData) continue;

        setUploadProgress(Math.round(5 + ((i + 1) / ids.length) * 85));

        try {
          // Use backend proxy to bypass CORS
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(docData.downloadURL)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          const arrayBuffer = await response.arrayBuffer();
          const fileExt = docData.name.split('.').pop()?.toLowerCase();

          if (fileExt === 'pdf') {
            try {
              const donorPdf = await PDFDocument.load(arrayBuffer);
              const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
              copiedPages.forEach((page) => mergedPdf.addPage(page));
              successCount++;
            } catch (pdfErr) {
              console.error("PDF load failed:", pdfErr);
              failedFiles.push(`${docData.name} (Invalid PDF)`);
            }
          } else {
            let image;
            try {
              try {
                image = await mergedPdf.embedJpg(arrayBuffer);
              } catch {
                image = await mergedPdf.embedPng(arrayBuffer);
              }
              
              const page = mergedPdf.addPage([595.28, 841.89]); // A4
              const { width, height } = image.scale(1);
              const maxWidth = 535;
              const maxHeight = 781;
              const scale = Math.min(maxWidth / width, maxHeight / height, 1);
              
              page.drawImage(image, {
                x: (page.getWidth() - width * scale) / 2,
                y: (page.getHeight() - height * scale) / 2,
                width: width * scale,
                height: height * scale,
              });
              successCount++;
            } catch (imgErr) {
              console.error("Image embedding failed:", imgErr);
              failedFiles.push(`${docData.name} (Format not supported)`);
            }
          }
        } catch (fetchErr: any) {
          console.error(`Fetch failed for ${docData.name}:`, fetchErr);
          failedFiles.push(`${docData.name} (Access Denied/CORS)`);
        }
      }

      if (successCount === 0) {
        throw new Error(
          "Could not process any files.\n\n" +
          "COMMON FIX: Your Firebase Storage needs CORS enabled to allow the browser to read files for printing.\n\n" +
          "Please check your Firebase console settings."
        );
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      // Open PDF in a new tab and trigger print
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      } else {
        // Fallback if popup is blocked
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.click();
        alert("The print document is ready! If it didn't open automatically, please check your browser's popup blocker or use the opened tab to print (Ctrl+P).");
      }

      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      if (failedFiles.length === 0) {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.7 },
          colors: ['#2563EB', '#3B82F6', '#1D4ED8']
        });
      } else {
        alert(`Printed ${successCount} files. Failed to include: \n${failedFiles.join('\n')}`);
      }

      setSelectedIds(new Set());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleLogout = () => signOut(auth);

  const getCategoryIcon = (category: Category) => {
    switch (category) {
      case 'ID Cards': return <Shield className="w-4 h-4" />;
      case 'Marksheets': return <GraduationCap className="w-4 h-4" />;
      case 'A4 Documents': return <FileText className="w-4 h-4" />;
      case 'Medical': return <Stethoscope className="w-4 h-4" />;
      case 'All': return <LayoutDashboard className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
    }
  };

  if (authChecking) {
    return (
      <div className="h-screen bg-[#F8FAFC] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-4 border-[#2563EB] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const sidebarElements = (
    <>
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3 text-[#2563EB] font-bold text-xl">
          <FileText className="w-8 h-8" />
          <span>DocManager</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(false)}
          className="lg:hidden p-2 hover:bg-[#F8FAFC] rounded-xl transition-colors"
        >
          <X className="w-5 h-5 text-[#64748B]" />
        </button>
      </div>

      {/* Step-by-Step Upload Flow */}
      <div className="space-y-4 mb-8">
        <label className="text-[11px] uppercase font-bold text-[#94A3B8] block tracking-wider px-1">Upload Center</label>
        
        <div className="space-y-4 bg-[#F8FAFC] p-4 rounded-[24px] border border-[#E2E8F0] shadow-sm">
          {/* Step 1: Category */}
          <div className="space-y-2">
            <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-tight ml-1">1. Choose Category</p>
            <select 
              disabled={isUploading}
              className="w-full bg-white border border-[#E2E8F0] rounded-xl px-3 py-3 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-[#2563EB]/5 transition-all cursor-pointer"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
            >
              <option value="">Select Category</option>
              {['ID Cards', 'Marksheets', 'A4 Documents', 'Medical', ...userCategories.filter(c => !['ID Cards', 'Marksheets', 'A4 Documents', 'Medical'].includes(c)), 'Custom'].map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* New: Custom Category Input */}
          <AnimatePresence>
            {uploadCategory === 'Custom' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-tight ml-1">Custom Name</p>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Enter category name..."
                  className="w-full bg-white border border-[#E2E8F0] rounded-xl px-3 py-3 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-[#2563EB]/5 transition-all"
                  value={customCategoryName}
                  onChange={(e) => setCustomCategoryName(e.target.value)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 2: Choose File (Only if Category selected) */}
          <AnimatePresence>
            {uploadCategory && !isUploading && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-tight ml-1">2. Select File</p>
                <input type="file" hidden ref={fileInputRef} onChange={handleFileSelect} />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                    selectedFile ? 'bg-blue-50 text-[#2563EB] border border-[#2563EB]/20' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB]/50'
                  }`}
                >
                  <FileUp className="w-3.5 h-3.5" />
                  {selectedFile ? 'File Selected' : 'Choose File'}
                </button>
                {selectedFile && <p className="text-[9px] mt-1 text-[#2563EB] truncate font-bold px-1">{selectedFile.name}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 3: Upload Button */}
          <AnimatePresence>
            {selectedFile && uploadCategory && !isUploading && (
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={performUpload}
                className="w-full bg-[#B91C1C] text-white py-4 rounded-xl text-xs font-black shadow-lg shadow-red-100 hover:bg-[#991B1B] transition-all transform active:scale-95 flex items-center justify-center gap-2"
              >
                <UploadCloud className="w-4 h-4" />
                START UPLOAD
              </motion.button>
            )}
          </AnimatePresence>

          {/* Upload Progress */}
          {isUploading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-2">
              <div className="h-2.5 w-full bg-[#E2E8F0] rounded-full overflow-hidden mb-2">
                <div className="h-full bg-[#B91C1C] transition-all duration-300 shadow-[0_0_8px_rgba(185,28,28,0.4)]" style={{ width: `${uploadProgress}%` }}></div>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-black text-[#A01A1A]">UPLOADING...</span>
                <span className="font-black text-[#64748B]">{uploadProgress}%</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        <label className="text-[11px] uppercase font-bold text-[#94A3B8] mb-4 block tracking-wider px-1">Main Library</label>
        {['All', ...userCategories].map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setIsSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-bold transition-all ${
              selectedCategory === cat 
                ? 'bg-[#EFF6FF] text-[#2563EB] shadow-sm' 
                : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
            }`}
          >
            {getCategoryIcon(cat)}
            {cat}
          </button>
        ))}
      </nav>

      <div className="pt-6 border-t border-[#E2E8F0]">
        <div className="bg-[#F8FAFC] p-5 rounded-[28px] border border-[#E2E8F0]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#2563EB] rounded-[18px] flex items-center justify-center font-black text-white shadow-xl shadow-blue-100">
              {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-black text-[#0F172A] truncate">{user.displayName || 'Vault User'}</p>
              <p className="text-[10px] text-[#94A3B8] font-bold truncate leading-tight uppercase tracking-tighter">Verified Account</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 text-xs font-black text-red-600 bg-white border border-red-100 rounded-xl hover:bg-red-50 transition-all shadow-sm active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout Session
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-[#1E293B] overflow-hidden font-sans relative">
      
      {/* Mobile Off-canvas Sidebar Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Mobile Off-canvas Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-[300px] bg-white z-[110] flex flex-col p-6 shadow-2xl lg:hidden overflow-y-auto scrollbar-hide"
          >
            {sidebarElements}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar (Fixed) */}
      <aside className="hidden lg:flex w-[300px] bg-white border-r border-[#E2E8F0] flex-col p-6 flex-shrink-0">
        {sidebarElements}
      </aside>

      {/* Main View */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-[72px] lg:h-[88px] bg-white border-b border-[#E2E8F0] px-4 lg:px-12 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 lg:hidden min-w-max">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-[#F8FAFC] rounded-xl transition-colors"
            >
              <Menu className="w-6 h-6 text-[#0F172A]" />
            </button>
            <div className="flex items-center gap-2 text-[#2563EB] font-bold text-lg">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          <div className="relative w-full max-w-2xl">
            <Search className="absolute left-4 lg:left-5 top-1/2 -translate-y-1/2 w-4 lg:w-4.5 h-4 lg:h-4.5 text-[#94A3B8]" />
            <input 
              type="text" 
              placeholder="Search documents..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 lg:pl-14 pr-4 lg:pr-6 py-2.5 lg:py-4 bg-[#F8FAFC] border-none rounded-[16px] lg:rounded-[20px] text-sm focus:ring-4 focus:ring-[#2563EB]/5 focus:bg-white transition-all outline-none"
            />
          </div>

          <div className="flex items-center gap-3 lg:gap-6 flex-shrink-0">
             <div className="hidden sm:flex lg:flex items-center gap-2.5 bg-green-50 px-3 lg:px-4 py-1.5 lg:py-2 rounded-full border border-green-100">
               <Shield className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-green-500" />
               <span className="text-[9px] lg:text-[10px] font-black text-green-700 uppercase tracking-wide">Secure</span>
             </div>
             <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F8FAFC] text-[#2563EB] rounded-[14px] lg:rounded-[18px] border border-[#E2E8F0] flex items-center justify-center shadow-sm hover:border-[#2563EB] transition-colors cursor-pointer">
                <User className="w-5 lg:w-6 h-5 lg:h-6" />
             </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-12 scrollbar-hide">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 lg:mb-12 gap-4">
            <div>
              <div className="flex items-center gap-2 lg:gap-3 mb-2">
                <span className="px-2 lg:px-3 py-1 bg-[#2563EB]/10 text-[#2563EB] text-[9px] lg:text-[10px] font-black uppercase rounded-full tracking-wider">Cloud Vault</span>
                <span className="w-1 h-1 bg-[#CBD5E1] rounded-full" />
                <span className="text-[9px] lg:text-[10px] text-[#64748B] font-bold uppercase">{documents.length} Files Total</span>
              </div>
              <h1 className="text-xl lg:text-3xl font-black text-[#0F172A] tracking-tight">{selectedCategory}</h1>
            </div>
            
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex items-center gap-2 lg:gap-3">
                  <button 
                    onClick={() => {
                        const links = Array.from(selectedIds).map(id => documents.find(d => d.id === id)?.downloadURL).join('\n');
                        alert(`Secure Direct Links:\n\n${links}`);
                    }}
                    className="flex items-center gap-2 bg-white border border-[#E2E8F0] text-[#0F172A] px-4 lg:px-6 py-2.5 lg:py-3 rounded-xl lg:rounded-2xl text-[10px] lg:text-xs font-bold hover:border-[#2563EB] transition-all shadow-sm"
                  >
                    <LinkIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#2563EB]" /> Get Links
                  </button>
                  <button className="bg-[#0F172A] text-white px-5 lg:px-8 py-2.5 lg:py-3.5 rounded-xl lg:rounded-2xl text-[10px] lg:text-xs font-black shadow-xl hover:bg-[#1E293B] transition-all active:scale-95">
                    Process ({selectedIds.size})
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {documents.length === 0 ? (
             <div className="min-h-[400px] flex flex-col items-center justify-center text-center">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-8 lg:p-12 rounded-[32px] lg:rounded-[48px] shadow-sm border border-[#E2E8F0] max-w-sm w-full mx-auto"
                >
                  <div className="w-20 h-20 lg:w-24 lg:h-24 bg-[#F8FAFC] rounded-[24px] lg:rounded-[32px] flex items-center justify-center mx-auto mb-6 lg:mb-8">
                    <UploadCloud className="w-8 lg:w-10 h-8 lg:h-10 text-[#2563EB]" />
                  </div>
                  <h3 className="text-lg lg:text-xl font-black text-[#1E293B] mb-2 lg:mb-3">No Documents</h3>
                  <p className="text-xs lg:text-sm text-[#64748B] font-medium leading-relaxed mb-6 lg:mb-8">
                    Select a category and upload your first file to get started. 
                  </p>
                  <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="text-[#2563EB] font-black text-[10px] lg:text-xs uppercase tracking-widest hover:underline"
                  >
                    Open Upload Center &rarr;
                  </button>
                </motion.div>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 lg:gap-10 pb-40">
              <AnimatePresence mode="popLayout">
                {filteredDocuments.map((doc) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={doc.id}
                    className={`group relative bg-white border-2 rounded-[32px] lg:rounded-[40px] overflow-hidden transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] cursor-default flex flex-col ${
                      selectedIds.has(doc.id) ? 'border-[#2563EB] bg-[#F8FAFC]' : 'border-transparent shadow-sm'
                    }`}
                    onClick={() => toggleSelection(doc.id)}
                  >
                    {/* Full Preview Hero Area */}
                    <div className="relative aspect-[4/3] lg:aspect-[3/2] w-full bg-[#F8FAFC] border-b border-[#F1F5F9] overflow-hidden">
                      {doc.type === 'pdf' ? (
                        <div className="w-full h-full relative group/pdf">
                          <iframe 
                            src={`/api/proxy?url=${encodeURIComponent(doc.downloadURL)}#toolbar=0&navpanes=0&scrollbar=0`} 
                            className="w-full h-full pointer-events-none" 
                            title={doc.name}
                          />
                          <div className="absolute inset-0 bg-transparent z-10" />
                        </div>
                      ) : ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(doc.type.toLowerCase()) ? (
                        <img 
                          src={doc.downloadURL} 
                          alt={doc.name} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-50">
                          <ImageIcon className="w-12 lg:w-16 h-12 lg:h-16 text-blue-500/30" />
                        </div>
                      )}

                      {/* Numbering Selection System */}
                      <div className="absolute top-4 right-4 z-10">
                        <div 
                          onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}
                          className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center font-black text-xs lg:text-sm transition-all cursor-pointer shadow-xl border-2 ${
                            selectedIds.has(doc.id) 
                              ? 'bg-[#2563EB] text-white border-white scale-110' 
                              : 'bg-white/40 backdrop-blur-md text-[#64748B] border-white/60 hover:bg-white/80'
                          }`}
                        >
                          {selectedIds.has(doc.id) ? (
                            Array.from(selectedIds).indexOf(doc.id) + 1
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          )}
                        </div>
                      </div>

                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <span className={`px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-lg lg:rounded-xl font-black uppercase tracking-widest text-[8px] lg:text-[9px] border shadow-lg backdrop-blur-md ${
                          doc.category === 'ID Cards' ? 'bg-red-50/90 text-red-700 border-red-200' :
                          doc.category === 'Marksheets' ? 'bg-yellow-50/90 text-yellow-700 border-yellow-200' :
                          doc.category === 'Medical' ? 'bg-green-50/90 text-green-700 border-green-200' :
                          'bg-blue-50/90 text-blue-700 border-blue-200'
                        }`}>
                          {doc.category}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 lg:p-6 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h3 className="font-black text-[15px] lg:text-lg text-[#0F172A] tracking-tighter truncate" title={doc.name}>{doc.name}</h3>
                        <p className="text-[10px] lg:text-xs font-black text-[#64748B] uppercase tracking-widest">
                          Uploaded: {doc.createdAt ? (
                            (() => {
                              const d = new Date(doc.createdAt);
                              return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
                            })()
                          ) : doc.date}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 lg:gap-3">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setFullscreenDoc(doc); }}
                          className="flex-1 py-3 lg:py-3.5 bg-[#0F172A] text-white rounded-2xl lg:rounded-[24px] text-[10px] lg:text-xs font-black hover:bg-[#2563EB] transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 shadow-[#0F172A]/10 group/btn"
                        >
                          <Maximize2 className="w-3.5 lg:w-4 h-3.5 lg:h-4 group-hover/btn:scale-110 transition-transform" /> VIEW FULL
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete Document',
                              message: `Delete "${doc.name}" forever?`,
                              onConfirm: () => {
                                  deleteDocument(doc.id, doc.storagePath);
                                  setConfirmModal(null);
                              }
                            });
                          }}
                          className="p-3 lg:p-3.5 bg-red-50 text-red-500 rounded-2xl lg:rounded-[24px] border border-red-100 hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90"
                        >
                          <Trash2 className="w-4.5 lg:w-5 h-4.5 lg:h-5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Full Screen Immersive Viewer */}
      <AnimatePresence>
        {fullscreenDoc && (
          <div className="fixed inset-0 z-[300] flex flex-col bg-[#0F172A]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-6 py-4 flex items-center justify-between bg-white/5 backdrop-blur-xl border-b border-white/10"
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setFullscreenDoc(null)} 
                  className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-white font-black text-sm lg:text-base tracking-tight">{fullscreenDoc.name}</h2>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest leading-none mt-1">{fullscreenDoc.category}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleSelection(fullscreenDoc.id)}
                  className={`px-6 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
                    selectedIds.has(fullscreenDoc.id)
                      ? 'bg-[#2563EB] text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]'
                      : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                  }`}
                >
                  {selectedIds.has(fullscreenDoc.id) ? (
                    <> <div className="w-4 h-4 rounded-full bg-white text-[#2563EB] text-[10px] flex items-center justify-center">{Array.from(selectedIds).indexOf(fullscreenDoc.id) + 1}</div> SELECTED </>
                  ) : (
                    'SELECT DOCUMENT'
                  )}
                </button>
                <a 
                  href={fullscreenDoc.downloadURL} 
                  download 
                  className="p-3 bg-white text-[#0F172A] rounded-2xl font-black hover:bg-[#2563EB] hover:text-white transition-all shadow-lg"
                >
                  <Download className="w-5 h-5" />
                </a>
              </div>
            </motion.div>

            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="flex-1 overflow-auto p-4 lg:p-12 flex items-center justify-center"
            >
              <div className="w-full max-w-5xl h-full bg-white rounded-[32px] overflow-hidden shadow-2xl relative">
                {fullscreenDoc.type === 'pdf' ? (
                  <div className="w-full h-full relative group">
                    <iframe 
                      src={`/api/proxy?url=${encodeURIComponent(fullscreenDoc.downloadURL)}`} 
                      className="w-full h-full border-none"
                      title="Doc Preview"
                    />
                    {/* Fallback for blocked PDFs */}
                    <div className="absolute bottom-4 right-4 z-50 pointer-events-none group-hover:pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      <a 
                        href={`/api/proxy?url=${encodeURIComponent(fullscreenDoc.downloadURL)}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] text-white rounded-xl text-xs font-bold shadow-2xl border border-white/20"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> OPEN EXTERNALLY
                      </a>
                    </div>
                  </div>
                ) : (
                  <img 
                    src={fullscreenDoc.downloadURL} 
                    alt="Preview" 
                    className="w-full h-full object-contain bg-[#F8FAFC]"
                  />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action HUD (Mobile-adjusted) */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 120, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            exit={{ y: 120, opacity: 0 }}
            className="fixed bottom-6 lg:bottom-12 left-4 lg:left-1/2 right-4 lg:right-auto lg:-translate-x-1/2 bg-[#0F172A]/90 backdrop-blur-xl text-white px-6 lg:px-10 py-4 lg:py-6 rounded-[24px] lg:rounded-[32px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] flex items-center justify-between lg:justify-start lg:gap-8 z-[60] border border-white/5"
          >
            <div className="flex flex-col border-r border-white/10 pr-6 lg:pr-10">
              <span className="text-sm lg:text-lg font-black tracking-tighter">{selectedIds.size} FILES</span>
              <span className="text-[8px] lg:text-[10px] text-[#2563EB] font-black uppercase tracking-widest">Selected</span>
            </div>
            <div className="flex items-center gap-3 lg:gap-4">
              <button 
                onClick={handlePrintSelection}
                disabled={isUploading}
                className="flex items-center gap-2 bg-[#2563EB] text-white px-4 lg:px-6 py-3 lg:py-3.5 rounded-xl lg:rounded-2xl text-[10px] lg:text-xs font-black shadow-lg hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> PRINT DOCUMENTS
              </button>
              
              <button 
                className="p-3 lg:p-4 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-90"
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'Delete Selection',
                    message: `Are you sure you want to delete ${selectedIds.size} files forever from the cloud?`,
                    onConfirm: () => {
                        selectedIds.forEach(id => {
                            const doc = documents.find(d => d.id === id);
                            deleteDocument(id, doc?.storagePath);
                        });
                        setSelectedIds(new Set());
                        setConfirmModal(null);
                    }
                  });
                }}
              >
                <Trash2 className="w-5 lg:w-6 h-5 lg:h-6" />
              </button>
              
              <button onClick={() => setSelectedIds(new Set())} className="text-[10px] lg:text-xs font-black text-[#94A3B8] hover:text-white transition-colors">CANCEL</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sleek Confirmation Modal */}
      <AnimatePresence>
        {confirmModal?.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl overflow-hidden"
            >
                <div className="w-16 h-16 bg-red-50 rounded-[24px] flex items-center justify-center mb-6 mx-auto">
                    <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-black text-[#0F172A] text-center mb-3 tracking-tight">{confirmModal.title}</h3>
                <p className="text-sm text-[#64748B] text-center mb-8 font-medium leading-relaxed px-4">
                    {confirmModal.message}
                </p>
                <div className="flex gap-4">
                    <button 
                        onClick={() => setConfirmModal(null)}
                        className="flex-1 py-4 bg-[#F1F5F9] text-[#64748B] font-bold rounded-2xl hover:bg-[#E2E8F0] transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={confirmModal.onConfirm}
                        className="flex-1 py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg shadow-red-200 hover:bg-red-600 transition-all active:scale-95"
                    >
                        Confirm
                    </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
