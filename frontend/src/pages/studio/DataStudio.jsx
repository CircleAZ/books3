import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_BASE, ENDPOINTS, API_ENDPOINTS } from '../../config/api';
import StudioVisualizer from './StudioVisualizer';
import './DataStudio.css';

// ── ENGINE METADATA DEFINITIONS ──
const ENGINES = [
  {
    id: 'demand',
    title: 'Demand Forecaster & Replenishment',
    shortName: 'Demand',
    icon: '📦',
    category: 'Core Optimization',
    description: 'Demand forecasting, safety stock days, and carton box packing quantization.',
    objective: 'Peak Season Bulk Procurement & Inventory Planning',
    metrics: [
      { label: 'Forecasted Units', value: '4,850', sub: '+18.4% YoY Season' },
      { label: 'Master Boxes', value: '342', sub: 'Case-Pack Quantized' },
      { label: 'Stockout Risk SKUs', value: '8', sub: 'Runway < 7 Days' },
      { label: 'Working Capital Req', value: '₹4.28L', sub: 'Estimated PO Total' },
    ],
  },
  {
    id: 'cross_sell',
    title: 'Cross-Sell & Basket Affinity',
    shortName: 'Cross-Sell',
    icon: '🔗',
    category: 'Commercial Discovery',
    description: 'Frequently co-purchased student supplies and curriculum kit bundle recommendations.',
    objective: 'Standardized School Syllabus Bundling & Kit Sales',
    metrics: [
      { label: 'Active Bundles', value: '46', sub: 'High-Affinity Pairs' },
      { label: 'Cross-Sell Rate', value: '68.4%', sub: 'Target Co-Purchase' },
      { label: 'Audited Orders', value: '318', sub: 'Multi-Item Baskets' },
      { label: 'Top Affinity Pair', value: '101 Baskets', sub: 'A4 176 + Cover' },
    ],
  },
  {
    id: 'village',
    title: 'Village Outlets & Route Planning',
    shortName: 'Village Outlets',
    icon: '🗺️',
    category: 'Territory Strategy',
    description: 'Branch outlet sales performance, consignment commission tracking, and delivery route planning.',
    objective: 'Direct Outlet Consignment & Route Planning',
    metrics: [
      { label: 'Active Outlets', value: '6', sub: 'Registered Partner Stores' },
      { label: 'Total Outlet Sales', value: '₹9,590', sub: 'Consignment Revenue' },
      { label: 'Total Commission', value: '₹1,255', sub: 'Commissions Paid' },
      { label: 'Avg Outlet Revenue', value: '₹1,598', sub: 'Per Store Average' },
    ],
  },
  {
    id: 'pricing',
    title: 'Dynamic Pricing & Margin Simulator',
    shortName: 'Pricing Lab',
    icon: '📈',
    category: 'Revenue Engineering',
    description: 'Simulate price changes with price elasticity and protected gross margin floors.',
    objective: 'Optimal Price Setting Before May Rush School Lock-In',
    metrics: [
      { label: 'Mean Elasticity', value: '-0.74', sub: 'Price Sensitivity Ratio' },
      { label: 'Margin Floor Flags', value: '0', sub: 'Safe Margin Floor 12%' },
      { label: 'Gross Margin Avg', value: '28.6%', sub: 'Target Floor Maintained' },
      { label: 'Simulated Revenue Δ', value: '+₹78.4k', sub: 'Projected Net Impact' },
    ],
  },
  {
    id: 'defects',
    title: 'Supplier Quality & Returns',
    shortName: 'Supplier Quality',
    icon: '🛡️',
    category: 'Failsafe Governance',
    description: 'Supplier return rates and defective inventory tracking to prevent faulty stock reception.',
    objective: 'Supplier Quality Enforcement & Vendor Returns',
    metrics: [
      { label: 'Overall Defect Rate', value: '0.31%', sub: '28 Total Damaged Units' },
      { label: 'Frozen Vendors', value: '0', sub: 'Threshold ≥ 6.0%' },
      { label: 'Physical Returns', value: '28', sub: 'From 8,908 Units Sold' },
      { label: 'Active Vendors', value: '9', sub: 'Verified Local Suppliers' },
    ],
  },
  {
    id: 'khata',
    title: 'Customer Khata & Credit Risk',
    shortName: 'Customer Khata',
    icon: '⚖️',
    category: 'Financial Governance',
    description: 'Customer credit limits, overdue invoices, and past-due account risk management.',
    objective: 'Preventing Delinquent Accounts from Draining Working Capital',
    metrics: [
      { label: 'Total At-Risk Credit', value: '₹18,450', sub: 'Across 12 Customer Accounts' },
      { label: 'Watchlist Accounts', value: '4', sub: 'Overdue Balances' },
      { label: 'Blocked Accounts', value: '2', sub: 'Legacy Debt or Limit Breach' },
      { label: 'Active Debtors', value: '12', sub: 'Accounts with Unpaid Orders' },
    ],
  },
  {
    id: 'andon',
    title: 'PO Replenishment Variance Gate',
    shortName: 'PO Variance Gate',
    icon: '🚨',
    category: 'Manufacturing Governance',
    description: 'Automated procurement safety gate checking purchase order cost hikes and sudden quantity jumps.',
    objective: 'Automated Purchase Order Protection',
    metrics: [
      { label: 'Circuit Status', value: 'CLEARED', sub: 'All Tolerances Verified' },
      { label: 'Volume Variance Latch', value: '±30%', sub: 'Noise Floor ≥ 5 Units' },
      { label: 'Cost Hike Latch', value: '+15%', sub: 'Exposure Floor ≥ ₹500' },
      { label: 'Audited PO Lines', value: '237', sub: 'Direct from Purchase Orders' },
    ],
  },
  {
    id: 'adhoc',
    title: 'Ad-Hoc Relational Discovery',
    shortName: 'Ad-Hoc Query',
    icon: '🔍',
    category: 'Relational Discovery',
    description: 'Multi-hop natural language & relational token query workbench across customers, villages, and decoupled item fulfillment.',
    objective: 'Ad-Hoc Operational Surfacing & Starved Fulfillment Recovery',
    metrics: [
      { label: 'Target Customers', value: '0', sub: 'Village Resolved' },
      { label: 'Starved Units', value: '0', sub: 'Shortfall Units' },
      { label: 'Unfulfilled Value', value: '₹0', sub: 'Recovery Exposure' },
      { label: 'Line Fulfillment', value: '0% Delivered', sub: 'Strictly Exclude Partial' },
    ],
  },
];

const DEFAULT_PARAMS = {
  demand: { safetyDays: 14, leadTime: 5, surgeMultiplier: 2.2, moqEnforce: true },
  cross_sell: { minSupport: 0.05, minConfidence: 0.35, minLift: 1.6 },
  village: { targetQuadrant: 'HIGH_GROWTH_FRONTIER', minOrderValue: 2000, targetVillages: 12 },
  pricing: { priceDeltaPct: 5, elasticityPrior: -0.75, marginFloor: 12 },
  defects: { laplaceAlpha: 1.0, laplaceBeta: 99.0, freezeThreshold: 6.0 },
  khata: { maxDsoDays: 45, creditLimit: 50000, blockDelinquent: true },
  andon: { volumeThresholdPct: 30, costThresholdPct: 15, noiseFloorQty: 5 },
  adhoc: {
    query: 'get all customers from village krushnapur who has ordered apsara pencil at price 55 and and that pencil is not delivered (something else might be delivered) but leave out those with some of the pencils are delivered.',
    entity: 'customer',
    village: 'Krushnapur',
    product: 'Apsara Pencil',
    price: 55,
    fulfillment: 'undelivered_strict',
    mode: 'natural',
  },
};

const ADHOC_PRESETS = [
  {
    label: 'Krushnapur: Apsara Pencil @ ₹55 (0% Delivered, Exclude Partial)',
    query: 'get all customers from village krushnapur who has ordered apsara pencil at price 55 and and that pencil is not delivered (something else might be delivered) but leave out those with some of the pencils are delivered.',
    tokens: {
      entity: 'customer',
      village: 'Krushnapur',
      product: 'Apsara Pencil',
      price: 55,
      fulfillment: 'undelivered_strict',
    },
  },
  {
    label: 'Mahuva: Natraj Eraser @ ₹10 (0% Delivered)',
    query: 'customers in Mahuva who ordered Natraj Eraser at price 10 with 0 delivered (exclude partial)',
    tokens: {
      entity: 'customer',
      village: 'Mahuva',
      product: 'Natraj Eraser',
      price: 10,
      fulfillment: 'undelivered_strict',
    },
  },
  {
    label: 'Dharampur: Std 10 Math Kit @ ₹150 (Starved Units)',
    query: 'customers in Dharampur who ordered Std 10 Math Kit at price 150 undelivered',
    tokens: {
      entity: 'customer',
      village: 'Dharampur',
      product: 'Std 10 Math Kit',
      price: 150,
      fulfillment: 'undelivered_strict',
    },
  },
  {
    label: 'Vansda: Classmate A4 Book @ ₹65 (Strict Undelivered)',
    query: 'customers in Vansda who ordered Classmate A4 Book at price 65 with 0 delivered',
    tokens: {
      entity: 'customer',
      village: 'Vansda',
      product: 'Classmate A4 Book',
      price: 65,
      fulfillment: 'undelivered_strict',
    },
  },
];

export default function DataStudio() {
  const navigate = useNavigate();
  const { fetchWithAuth } = useAuth();

  // ── COCKPIT STATE ──
  const [activeEngineId, setActiveEngineId] = useState('demand');
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);
  const [studioMode, setStudioMode] = useState('operator'); // 'operator' | 'quant'
  const [searchCatalogQuery, setSearchCatalogQuery] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [latencyMs, setLatencyMs] = useState(18);
  const [computeData, setComputeData] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  const [andonStatus, setAndonStatus] = useState('CLEARED');
  const abortControllerRef = useRef(null);

  // ── 8th Engine: Ad-Hoc Relational Discovery State ──
  const [adhocInputMode, setAdhocInputMode] = useState('natural'); // 'natural' | 'tokens'
  const [adhocQueryInput, setAdhocQueryInput] = useState(
    'get all customers from village krushnapur who has ordered apsara pencil at price 55 and and that pencil is not delivered (something else might be delivered) but leave out those with some of the pencils are delivered.'
  );
  const [adhocTokens, setAdhocTokens] = useState({
    entity: 'customer',
    village: 'Krushnapur',
    product: 'Apsara Pencil',
    price: 55,
    fulfillment: 'undelivered_strict',
  });

  // Slice 7.3: Interactive Cohort Visualizer & Mobile Viewport States
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [isChartMinimized, setIsChartMinimized] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState('table'); // 'table' | 'visualizer'
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  // Mobile viewport resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset selected entity on engine switch
  useEffect(() => {
    setSelectedEntityId(null);
  }, [activeEngineId]);

  const handleSelectEntity = (id) => {
    setSelectedEntityId((prev) => (prev === id ? null : id));
  };

  // Active Modals for Action Levers
  const [activeModal, setActiveModal] = useState(null); // 'outlet_manifest' | 'route_sheet' | 'save_investigation' | 'dispatch_po' | 'andon_control_room'
  const [selectedOutlet, setSelectedOutlet] = useState('Kaliawadi Branch Outlet (Tempo #1)');
  const [selectedVillage, setSelectedVillage] = useState('Dharampur Frontier Sector');

  // Slice 7.4: Live Action Triggers & Andon Overrides
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchOverrideReason, setDispatchOverrideReason] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [dispatchError, setDispatchError] = useState(null);

  const [andonOverrideReason, setAndonOverrideReason] = useState('');
  const [isOverridingAndon, setIsOverridingAndon] = useState(false);
  const [andonSuccessMsg, setAndonSuccessMsg] = useState('');

  const [assignedVehicle, setAssignedVehicle] = useState('GJ-21-V-8841 (Tempo #1)');
  const [assignedCustodian, setAssignedCustodian] = useState('Ramesh Patel (Staff #104)');
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  // Global Escape key listener to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
        setDispatchResult(null);
        setDispatchError(null);
        setAndonSuccessMsg('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Folders tree state & Slice 7.5 Persistence State
  const [folders, setFolders] = useState([]);
  const [segments, setSegments] = useState([]);
  const [catalogDrawerTab, setCatalogDrawerTab] = useState('folders'); // 'folders' | 'segments'
  const [expandedFolderIds, setExpandedFolderIds] = useState(new Set(['root-general']));
  const [loadedInvestigation, setLoadedInvestigation] = useState(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [saveToastMsg, setSaveToastMsg] = useState('');

  // Folder creation modal state
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Save analysis snapshot modal state
  const [saveAnalysisName, setSaveAnalysisName] = useState('');
  const [saveAnalysisFolderId, setSaveAnalysisFolderId] = useState('');
  const [isForkingCohort, setIsForkingCohort] = useState(false);
  const [forkCohortName, setForkCohortName] = useState('');
  const [forkCohortTarget, setForkCohortTarget] = useState('product');
  const [isSavingAnalysis, setIsSavingAnalysis] = useState(false);
  const [saveErrorMsg, setSaveErrorMsg] = useState('');

  // Engine Parameters
  const [params, setParams] = useState(DEFAULT_PARAMS);

  const activeEngine = useMemo(() => {
    return ENGINES.find((e) => e.id === activeEngineId) || ENGINES[0];
  }, [activeEngineId]);

  // Refresh folders tree and discovery segments from Django backend
  const refreshCatalog = async () => {
    setIsLoadingCatalog(true);
    try {
      const [foldersRes, segmentsRes] = await Promise.allSettled([
        fetchWithAuth(ENDPOINTS.ANALYTICS_FOLDERS_TREE),
        fetchWithAuth(ENDPOINTS.ANALYTICS_SEGMENTS),
      ]);

      if (foldersRes.status === 'fulfilled' && foldersRes.value.ok) {
        const foldersData = await foldersRes.value.json();
        if (Array.isArray(foldersData)) {
          setFolders(foldersData);
          setExpandedFolderIds((prev) => {
            const next = new Set(prev);
            foldersData.forEach((f) => {
              if (f.is_pinned || f.is_virtual || (f.analyses && f.analyses.length > 0)) {
                next.add(f.id);
              }
            });
            return next;
          });
        }
      }

      if (segmentsRes.status === 'fulfilled' && segmentsRes.value.ok) {
        const segData = await segmentsRes.value.json();
        const segList = Array.isArray(segData) ? segData : (segData?.results || []);
        setSegments(segList);
      }
    } catch (err) {
      console.warn('Error loading studio catalog:', err);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  useEffect(() => {
    refreshCatalog();
  }, [fetchWithAuth]);

  // Live calculation debounce hook (280ms trailing buffer with AbortController)
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSimulating(true);
    const timer = setTimeout(async () => {
      try {
        const queryPayload = activeEngineId === 'adhoc'
          ? (adhocInputMode === 'natural'
              ? { query: adhocQueryInput, mode: 'natural' }
              : { mode: 'tokens', ...adhocTokens, ...(params.adhoc || {}) })
          : params[activeEngineId] || {};

        const targetEndpoint = activeEngineId === 'adhoc'
          ? (ENDPOINTS.ANALYTICS_ADHOC_QUERY || `${API_BASE}/analytics/adhoc-query/`)
          : `${API_BASE}/analytics/compute/${activeEngineId}/`;

        const res = await fetchWithAuth(targetEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: queryPayload, ...queryPayload }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setComputeData(data);
          setIsFallback(Boolean(data.is_fallback));
          if (data.execution_ms != null) {
            setLatencyMs(Math.round(data.execution_ms));
          }
          if (data.tokens && activeEngineId === 'adhoc') {
            setAdhocTokens((prev) => ({
              ...prev,
              ...data.tokens,
            }));
          }
          if (data.metrics) {
            const andonMetric = data.metrics.find(
              (m) => m.label && m.label.toLowerCase().includes('latch status')
            );
            if (andonMetric) {
              setAndonStatus(andonMetric.value);
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Data Studio computation error:', err);
        }
      } finally {
        setIsSimulating(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeEngineId, params, adhocQueryInput, adhocInputMode, adhocTokens, fetchWithAuth]);

  // Handle Parameter Slider Change
  const handleParamChange = (engineKey, field, value) => {
    setParams((prev) => ({
      ...prev,
      [engineKey]: {
        ...prev[engineKey],
        [field]: value,
      },
    }));
  };

  const selectedItem = useMemo(() => {
    if (!selectedEntityId || !computeData?.items) return null;
    return computeData.items.find((it) => it.id === selectedEntityId) || null;
  }, [selectedEntityId, computeData]);

  // Action Levers Handlers (Slice 7.4 Live Pipeline Triggers)
  const handleLaunchPOHandoff = () => {
    setDispatchResult(null);
    setDispatchError(null);
    setDispatchOverrideReason('');
    setActiveModal('dispatch_po');
  };

  const downloadCSV = (filename, content) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportManifestCSV = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const rows = [
      ['"Outlet Destination"', '"Tempo Vehicle"', '"Custodian"', '"Product / SKU"', '"Pack Size"', '"Master Cartons"', '"Total Units"', '"Staged Date"']
    ];
    const items = computeData?.items || [];
    items.forEach((it) => {
      const q = it.quant_details || {};
      const casePack = q.case_pack || 10;
      const targetUnits = it.target ? parseInt(it.target.replace(/[^\d]/g, ''), 10) || 20 : 20;
      const cartons = Math.ceil(targetUnits / casePack);
      rows.push([
        `"${selectedOutlet.replace(/"/g, '""')}"`,
        `"${assignedVehicle.replace(/"/g, '""')}"`,
        `"${assignedCustodian.replace(/"/g, '""')}"`,
        `"${it.entity.replace(/"/g, '""')}"`,
        casePack,
        cartons,
        cartons * casePack,
        `"${dateStr}"`
      ]);
    });
    downloadCSV(`Outlet_Staging_Manifest_${selectedOutlet.replace(/\s+/g, '_')}_${dateStr}.csv`, rows.map((r) => r.join(',')).join('\n'));
  };

  const handleExportRunSheetCSV = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const rows = [
      ['"Stop #"', '"Student / Family Name"', '"Village Sector"', '"Kit Description"', '"COD Due (INR)"', '"Payment Status"', '"Signature"']
    ];

    if (activeEngineId === 'adhoc' && computeData?.items?.length > 0) {
      computeData.items.forEach((it, idx) => {
        const q = it.quant_details || {};
        const cName = it.customer_name || it.entity?.split(' (')[0] || it.entity;
        const vName = it.village || it.category || selectedVillage;
        const pName = it.product_name || 'Starved Product';
        const shortfall = it.shortfall_qty != null ? it.shortfall_qty : (q.shortfall_qty || 1);
        const price = it.unit_price || q.unit_price || 55;
        const codDue = Math.round(shortfall * price);

        rows.push([
          idx + 1,
          `"${cName.replace(/"/g, '""')}"`,
          `"${vName.replace(/"/g, '""')}"`,
          `"${pName.replace(/"/g, '""')} (${shortfall} units starved)"`,
          codDue,
          '"PENDING CASH"',
          '""'
        ]);
      });
      const exportVillage = computeData.tokens?.village || selectedVillage;
      downloadCSV(`DoorToDoor_RunSheet_${exportVillage.replace(/\s+/g, '_')}_${dateStr}.csv`, rows.map((r) => r.join(',')).join('\n'));
      return;
    }

    const dummyStudents = [
      { stop: 1, name: 'Patel Aarav', village: selectedVillage, kit: 'Std 10 Complete Syllabus Kit', cod: 1840 },
      { stop: 2, name: 'Desai Diya', village: selectedVillage, kit: 'Std 10 Science & Math Bundle', cod: 1220 },
      { stop: 3, name: 'Shah Vivaan', village: selectedVillage, kit: 'Std 10 Complete Syllabus Kit', cod: 1840 },
      { stop: 4, name: 'Chaudhari Ananya', village: selectedVillage, kit: 'Std 10 Stationery Pack', cod: 450 },
      { stop: 5, name: 'Tandel Aryan', village: selectedVillage, kit: 'Std 10 Complete Syllabus Kit', cod: 1840 },
    ];
    dummyStudents.forEach((st) => {
      rows.push([
        st.stop,
        `"${st.name.replace(/"/g, '""')}"`,
        `"${st.village.replace(/"/g, '""')}"`,
        `"${st.kit.replace(/"/g, '""')}"`,
        st.cod,
        '"PENDING CASH"',
        '""'
      ]);
    });
    downloadCSV(`DoorToDoor_RunSheet_${selectedVillage.replace(/\s+/g, '_')}_${dateStr}.csv`, rows.map((r) => r.join(',')).join('\n'));
  };

  const handleCopyWhatsAppBroadcast = () => {
    const villageName = activeEngineId === 'adhoc' && computeData?.tokens?.village
      ? computeData.tokens.village
      : selectedVillage;
    const text = `📢 *AZ Books Door-to-Door Book Distribution Notification*\n\nDear Parents of ${villageName.replace(/_/g, ' ').toUpperCase()},\nOur mobile book delivery tempo will arrive tomorrow at 10:00 AM near the Panchayat Hall.\n\n📚 *Standard 10 Complete Syllabus Kits & Starved Supplies* are packed and reserved for your child.\n💵 *Amount Due (COD):* Exact cash or UPI accepted.\n\nPlease collect your verified supplies with invoice.\n— AZ Books Logistics Team`;
    navigator.clipboard.writeText(text);
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2000);
  };

  const dispatchPreviewItems = useMemo(() => {
    const targetItems = selectedItem ? [selectedItem] : computeData?.items || [];
    if (activeEngineId !== 'adhoc') {
      return targetItems.slice(0, 5).map((it) => ({
        entity: it.entity,
        target: it.target,
        baseline: it.baseline,
        cost: it.quant_details?.cost_price || 110,
      }));
    }
    const productMap = {};
    targetItems.forEach((it) => {
      const q = it.quant_details || {};
      const pid = it.product_id || q.product_id || it.id;
      const matchUnits = it.shortfall_qty != null
        ? it.shortfall_qty
        : (it.target ? parseInt(it.target.replace(/[^\d]/g, ''), 10) : 20);
      const validUnits = Number.isFinite(matchUnits) && matchUnits > 0 ? matchUnits : 1;

      if (!productMap[pid]) {
        productMap[pid] = {
          entity: it.product_name || q.product_name || 'Target SKU',
          units: 0,
          casePack: q.case_pack || 10,
          cost: q.cost_price || 42,
        };
      }
      productMap[pid].units += validUnits;
    });
    return Object.values(productMap).map((p) => ({
      entity: p.entity,
      target: `${p.units} Starved Units`,
      baseline: `${Math.ceil(p.units / p.casePack)} Master Cartons`,
      cost: p.cost,
    }));
  }, [selectedItem, computeData, activeEngineId]);

  const handleExecuteDispatchPO = async () => {
    setIsDispatching(true);
    setDispatchError(null);
    try {
      const targetItems = selectedItem ? [selectedItem] : computeData?.items || [];
      const productMap = {};
      targetItems.forEach((it) => {
        const q = it.quant_details || {};
        const pid = it.product_id || q.product_id || it.id;
        const matchUnits = it.shortfall_qty != null
          ? it.shortfall_qty
          : (it.target ? parseInt(it.target.replace(/[^\d]/g, ''), 10) : 20);
        const validUnits = Number.isFinite(matchUnits) && matchUnits > 0 ? matchUnits : 1;

        if (!productMap[pid]) {
          productMap[pid] = {
            product_id: pid,
            suggested_quantity: 0,
            vendor_case_pack: q.case_pack || 10,
            moq: q.case_pack || 10,
            unit_cost_price: q.cost_price || 42.0,
            product_name: it.product_name || q.product_name || it.entity,
          };
        }
        productMap[pid].suggested_quantity += validUnits;
      });
      const payloadItems = Object.values(productMap);

      const res = await fetchWithAuth(API_ENDPOINTS.ANALYTICS_DISPATCH_PO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: dispatchNotes || `Data Studio 1-Tap PO Dispatch (${activeEngineId})`,
          override_reason: dispatchOverrideReason || '',
          items: payloadItems,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setDispatchResult(data);
        if (data.payload_snapshot?.andon_status) {
          setAndonStatus(data.payload_snapshot.andon_status);
        }
      } else {
        setDispatchError(data.detail || data.message || 'Dispatch failed. Review item specifications.');
      }
    } catch (err) {
      setDispatchError(err.message || 'Network error dispatching PO transfer.');
    } finally {
      setIsDispatching(false);
    }
  };

  const handleStudioOverrideAndon = async () => {
    if (!andonOverrideReason || andonOverrideReason.trim().length < 5) {
      alert('Override justification must be at least 5 characters.');
      return;
    }
    setIsOverridingAndon(true);
    try {
      const res = await fetchWithAuth(API_ENDPOINTS.ANALYTICS_STUDIO_OVERRIDE_ANDON, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: andonOverrideReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setAndonStatus('OVERRIDDEN');
        setAndonSuccessMsg(`Circuit Latch Overridden: ${andonOverrideReason}`);
        setTimeout(() => setActiveModal(null), 1500);
      } else {
        alert(data.reason?.[0] || data.detail || 'Override failed.');
      }
    } catch (err) {
      alert(err.message || 'Error authorizing override.');
    } finally {
      setIsOverridingAndon(false);
    }
  };

  // ── SLICE 7.5: WORKSPACE PERSISTENCE & CATALOG HANDLERS ──
  const toggleFolderExpand = (folderId) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleLoadAnalysis = (analysis) => {
    let engineKey = analysis.engine_type;
    if (engineKey === 'defect_radar') engineKey = 'defects';

    if (ENGINES.some((e) => e.id === engineKey)) {
      setActiveEngineId(engineKey);
    }

    if (analysis.parameters && typeof analysis.parameters === 'object') {
      setParams((prev) => ({
        ...prev,
        [engineKey]: {
          ...prev[engineKey],
          ...analysis.parameters,
        },
      }));
    }

    if (engineKey === 'adhoc' && analysis.parameters) {
      if (analysis.parameters.query) {
        setAdhocQueryInput(analysis.parameters.query);
      }
      setAdhocTokens((prev) => ({
        ...prev,
        ...analysis.parameters,
      }));
      if (analysis.parameters.mode) {
        setAdhocInputMode(analysis.parameters.mode);
      }
    }

    setLoadedInvestigation(analysis);
    setSaveToastMsg(`Loaded workspace: "${analysis.name}"`);
    setTimeout(() => setSaveToastMsg(''), 4000);
  };

  const handleResetToDefault = () => {
    setParams((prev) => ({
      ...prev,
      [activeEngineId]: { ...DEFAULT_PARAMS[activeEngineId] },
    }));
    setLoadedInvestigation(null);
    setSaveToastMsg(`Reset ${activeEngine.shortName} parameters to factory default.`);
    setTimeout(() => setSaveToastMsg(''), 3000);
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);
    try {
      const payload = {
        name: newFolderName.trim(),
        parent: newFolderParentId && newFolderParentId !== 'root' ? newFolderParentId : null,
      };
      const res = await fetchWithAuth(ENDPOINTS.ANALYTICS_FOLDERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewFolderName('');
        setNewFolderParentId('');
        setIsFolderModalOpen(false);
        setSaveToastMsg('Investigation folder created.');
        setTimeout(() => setSaveToastMsg(''), 3000);
        await refreshCatalog();
      } else {
        const errData = await res.json();
        alert(`Failed to create folder: ${JSON.stringify(errData)}`);
      }
    } catch (err) {
      alert(`Error creating folder: ${err.message}`);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteAnalysis = async (e, analysisId, analysisName) => {
    e.stopPropagation();
    if (!window.confirm(`Delete saved investigation "${analysisName}"?`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/analytics/saved-analyses/${analysisId}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        if (loadedInvestigation?.id === analysisId) {
          setLoadedInvestigation(null);
        }
        await refreshCatalog();
      }
    } catch (err) {
      console.warn('Error deleting analysis:', err);
    }
  };

  const handleDeleteFolder = async (e, folderId, folderName) => {
    e.stopPropagation();
    if (!window.confirm(`Delete folder "${folderName}" and archive its runs?`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/analytics/folders/${folderId}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        await refreshCatalog();
      }
    } catch (err) {
      console.warn('Error deleting folder:', err);
    }
  };

  const handleDeleteSegment = async (e, segmentId, segmentName) => {
    e.stopPropagation();
    if (!window.confirm(`Delete discovery cohort "${segmentName}"?`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/analytics/segments/${segmentId}/`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        await refreshCatalog();
      }
    } catch (err) {
      console.warn('Error deleting segment:', err);
    }
  };

  const handlePrimeLeverFromSegment = (seg) => {
    if (seg.target_entity === 'product') {
      setActiveEngineId('demand');
      setDispatchResult(null);
      setDispatchError(null);
      setActiveModal('dispatch_po');
    } else if (seg.target_entity === 'village') {
      setActiveEngineId('village');
      setActiveModal('outlet_manifest');
    } else {
      setActiveEngineId('khata');
      setActiveModal('route_sheet');
    }
    setSaveToastMsg(`Primed fulfillment lever for cohort "${seg.name}"`);
    setTimeout(() => setSaveToastMsg(''), 4000);
  };

  const handleOpenSaveModal = () => {
    setSaveAnalysisName(`${activeEngine.shortName} Run — ${new Date().toLocaleDateString()}`);
    setSaveAnalysisFolderId('');
    setIsForkingCohort(false);
    setForkCohortName(`${activeEngine.shortName} Discovery Cohort — ${new Date().toLocaleDateString()}`);
    let defaultTarget = 'product';
    if (activeEngineId === 'village') defaultTarget = 'village';
    else if (activeEngineId === 'khata' || activeEngineId === 'cross_sell' || activeEngineId === 'adhoc') defaultTarget = 'customer';
    setForkCohortTarget(defaultTarget);
    setSaveErrorMsg('');
    setActiveModal('save_investigation');
  };

  const handleExecuteSaveInvestigation = async () => {
    if (!saveAnalysisName.trim()) {
      setSaveErrorMsg('Please provide an investigation name.');
      return;
    }
    setIsSavingAnalysis(true);
    setSaveErrorMsg('');

    try {
      const analysisPayload = {
        name: saveAnalysisName.trim(),
        folder: saveAnalysisFolderId && saveAnalysisFolderId !== 'root' && saveAnalysisFolderId !== 'root-general' ? saveAnalysisFolderId : null,
        engine_type: activeEngineId,
        parameters: params[activeEngineId] || {},
        cached_insights: {
          metrics: computeData?.metrics || [],
          items_count: computeData?.items?.length || 0,
          execution_ms: latencyMs,
          andon_status: andonStatus,
        },
      };

      const saveRes = await fetchWithAuth(ENDPOINTS.ANALYTICS_SAVED_ANALYSES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysisPayload),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        throw new Error(err.detail || JSON.stringify(err));
      }

      const savedData = await saveRes.json();
      setLoadedInvestigation(savedData);

      if (isForkingCohort && computeData?.items?.length > 0) {
        let rawIds = [];
        if (forkCohortTarget === 'customer') {
          rawIds = computeData.items.map((it) => String(it.customer_id || it.id)).filter(Boolean);
        } else if (forkCohortTarget === 'product') {
          rawIds = computeData.items.map((it) => String(it.product_id || it.id)).filter(Boolean);
        } else if (forkCohortTarget === 'order') {
          rawIds = computeData.items.map((it) => String(it.order_id || it.id)).filter(Boolean);
        } else {
          rawIds = computeData.items.map((it) => String(it.id || it.entity)).filter(Boolean);
        }
        const entityIds = Array.from(new Set(rawIds)).slice(0, 100);
        const segmentPayload = {
          name: forkCohortName.trim() || `${saveAnalysisName} Cohort`,
          target_entity: forkCohortTarget,
          entity_ids: entityIds,
          cohort_metrics: {
            item_count: entityIds.length,
            source_analysis_id: savedData.id,
            engine: activeEngineId,
            timestamp: new Date().toISOString(),
          },
          source_engine: activeEngineId,
        };

        await fetchWithAuth(ENDPOINTS.ANALYTICS_SEGMENTS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(segmentPayload),
        });
      }

      setActiveModal(null);
      setSaveToastMsg(`Investigation "${savedData.name}" saved!`);
      setTimeout(() => setSaveToastMsg(''), 4000);
      await refreshCatalog();
    } catch (err) {
      setSaveErrorMsg(err.message || 'Failed to save investigation.');
    } finally {
      setIsSavingAnalysis(false);
    }
  };

  const getEngineIcon = (engineType) => {
    switch (engineType) {
      case 'demand': return '📦';
      case 'cross_sell': return '🔗';
      case 'village': return '🗺️';
      case 'pricing': return '🏷️';
      case 'defects':
      case 'defect_radar': return '🛡️';
      case 'khata': return '💰';
      case 'andon': return '⚡';
      case 'adhoc': return '🔍';
      default: return '📊';
    }
  };

  const renderFolderTree = (folderList, depth = 0) => {
    if (!folderList || folderList.length === 0) {
      if (depth === 0) {
        return (
          <div className="empty-catalog-hint">
            <span>No investigation folders found.</span>
            <button
              type="button"
              className="btn-dock-toggle"
              style={{ marginTop: '6px', fontSize: '0.72rem' }}
              onClick={() => setIsFolderModalOpen(true)}
            >
              + Create First Folder
            </button>
          </div>
        );
      }
      return null;
    }

    const filtered = folderList.filter((f) => {
      if (!searchCatalogQuery.trim()) return true;
      const q = searchCatalogQuery.toLowerCase();
      const nameMatch = f.name?.toLowerCase().includes(q);
      const childMatch = f.children && f.children.some((c) => c.name?.toLowerCase().includes(q));
      const analysisMatch = f.analyses && f.analyses.some((a) => a.name?.toLowerCase().includes(q));
      return nameMatch || childMatch || analysisMatch;
    });

    return filtered.map((folder) => {
      const isExpanded = expandedFolderIds.has(folder.id) || searchCatalogQuery.trim().length > 0;
      const hasChildren = folder.children && folder.children.length > 0;
      const hasAnalyses = folder.analyses && folder.analyses.length > 0;
      const totalCount = folder.analyses ? folder.analyses.length : (folder.analyses_count || 0);

      return (
        <div key={folder.id} className="folder-tree-node">
          <div
            className={`folder-tree-item ${loadedInvestigation?.folder === folder.id ? 'active' : ''}`}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => toggleFolderExpand(folder.id)}
          >
            <div className="folder-item-left">
              <span className="folder-chevron">
                {hasChildren || hasAnalyses ? (isExpanded ? '▾' : '▸') : '•'}
              </span>
              <span className="folder-icon">{folder.is_pinned ? '📌' : folder.is_virtual ? '🗂️' : '📁'}</span>
              <span className="folder-name-label" title={folder.name}>{folder.name}</span>
            </div>

            <div className="folder-item-right">
              <span className="folder-count-pill">{totalCount}</span>
              {!folder.is_virtual && (
                <button
                  type="button"
                  className="folder-del-btn"
                  onClick={(e) => handleDeleteFolder(e, folder.id, folder.name)}
                  title="Archive folder"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="folder-expanded-content">
              {/* Nested Child Folders */}
              {hasChildren && renderFolderTree(folder.children, depth + 1)}

              {/* Saved Analysis Runs in this Folder */}
              {hasAnalyses && (
                <div className="folder-runs-list" style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}>
                  {folder.analyses.map((sa) => {
                    const isSelected = loadedInvestigation?.id === sa.id;
                    return (
                      <div
                        key={sa.id}
                        className={`saved-run-item ${isSelected ? 'active-run' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadAnalysis(sa);
                        }}
                        title={`Click to hydrate workspace: ${sa.name}`}
                      >
                        <div className="saved-run-left">
                          <span className="saved-run-engine-icon">{getEngineIcon(sa.engine_type)}</span>
                          <span className="saved-run-title">{sa.name}</span>
                        </div>
                        <div className="saved-run-right">
                          <button
                            type="button"
                            className="run-del-btn"
                            onClick={(e) => handleDeleteAnalysis(e, sa.id, sa.name)}
                            title="Delete saved run"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!hasChildren && !hasAnalyses && (
                <div
                  className="empty-folder-subtext"
                  style={{ paddingLeft: `${(depth + 1) * 14 + 14}px` }}
                >
                  (No saved investigations)
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const renderSegmentsList = () => {
    const q = searchCatalogQuery.trim().toLowerCase();
    const filtered = segments.filter((s) => {
      if (!q) return true;
      return s.name?.toLowerCase().includes(q) || (s.target_entity && s.target_entity.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      return (
        <div className="empty-catalog-hint">
          <span>No discovery segments found.</span>
          <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '6px 0 0 0' }}>
            When saving an investigation, check "Fork Active Entities" to materialize living cohorts for logistics handoff.
          </p>
        </div>
      );
    }

    return (
      <div className="segments-list-container">
        {filtered.map((seg) => {
          const count = seg.entity_count || (Array.isArray(seg.entity_ids) ? seg.entity_ids.length : 0);
          const targetIcon = seg.target_entity === 'customer' ? '👥' : seg.target_entity === 'village' ? '🏠' : '📦';
          return (
            <div key={seg.id} className="segment-card">
              <div className="segment-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <span>{targetIcon}</span>
                  <span className="segment-card-title" title={seg.name}>{seg.name}</span>
                </div>
                <button
                  type="button"
                  className="run-del-btn"
                  onClick={(e) => handleDeleteSegment(e, seg.id, seg.name)}
                  title="Delete cohort segment"
                >
                  ✕
                </button>
              </div>

              <div className="segment-card-badges">
                <span className="segment-pill-target">{seg.target_entity_display || seg.target_entity}</span>
                <span className="segment-pill-count">{count} entities</span>
                {seg.source_engine && (
                  <span className="segment-pill-engine">{getEngineIcon(seg.source_engine)} {seg.source_engine}</span>
                )}
              </div>

              <div className="segment-card-actions">
                <button
                  type="button"
                  className="segment-prime-btn"
                  onClick={() => handlePrimeLeverFromSegment(seg)}
                  title="Prime bottom physical fulfillment levers with this cohort"
                >
                  <span>🚀 Prime Fulfillment Lever</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="data-studio-container">
      {/* ── TOP COCKPIT COMMAND BAR ── */}
      <header className="studio-top-bar">
        <div className="studio-title-block">
          <span className="studio-brand-badge">Operations Studio</span>
          <h1 className="studio-heading">
            <span>{activeEngine.icon}</span>
            <span>{activeEngine.title}</span>
          </h1>
        </div>

        {/* Engine Telemetry Meter */}
        <div className="studio-engine-telemetry">
          <div className="telemetry-chip pulse">
            <span>Engine:</span>
            <strong>{isFallback ? '🛡️ Live PostgreSQL Engine' : '⚡ High-Speed Compute'}</strong>
          </div>
          <div className="telemetry-chip">
            <span>Latency:</span>
            <strong>{latencyMs}ms</strong>
          </div>
          <div
            className={`andon-badge-mini ${andonStatus === 'TRIPPED' ? 'tripped' : andonStatus === 'OVERRIDDEN' ? 'cleared' : 'cleared'}`}
            onClick={() => setActiveModal('andon_control_room')}
            style={{ cursor: 'pointer' }}
            title="Click to open PO Variance Gate Control"
          >
            <span>{andonStatus === 'TRIPPED' ? '⚠️' : andonStatus === 'OVERRIDDEN' ? '🟢' : '🛡️'}</span>
            <span>PO GATE: {andonStatus}</span>
          </div>
        </div>

        {/* Top Controls & Drawer Toggles */}
        <div className="studio-top-actions">
          <div className="studio-mode-toggle desktop-only">
            <button
              type="button"
              className={`studio-mode-btn ${studioMode === 'operator' ? 'active' : ''}`}
              onClick={() => setStudioMode('operator')}
            >
              Operator
            </button>
            <button
              type="button"
              className={`studio-mode-btn ${studioMode === 'quant' ? 'active' : ''}`}
              onClick={() => setStudioMode('quant')}
            >
              Quant Lab
            </button>
          </div>

          <button
            type="button"
            className={`btn-dock-toggle ${isLeftDrawerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsLeftDrawerOpen(!isLeftDrawerOpen);
              if (!isLeftDrawerOpen) setIsRightDrawerOpen(false);
            }}
            title="Toggle Catalog Drawer"
          >
            <span>📂</span>
            <span className="btn-text">Catalog</span>
          </button>

          <button
            type="button"
            className={`btn-dock-toggle ${isRightDrawerOpen ? 'active' : ''}`}
            onClick={() => {
              setIsRightDrawerOpen(!isRightDrawerOpen);
              if (!isRightDrawerOpen) setIsLeftDrawerOpen(false);
            }}
            title="Toggle Parameter Inspector"
          >
            <span>⚙️</span>
            <span className="btn-text">Inspector</span>
          </button>
        </div>
      </header>

      {/* ── UNIFIED HORIZONTAL ENGINE STRIP (Desktop & Mobile) ── */}
      <nav className="studio-engine-nav-strip" aria-label="Analytical Engines">
        {ENGINES.map((eng) => (
          <button
            key={eng.id}
            type="button"
            className={`engine-nav-chip ${activeEngineId === eng.id ? 'active' : ''}`}
            onClick={() => setActiveEngineId(eng.id)}
          >
            <span className="engine-chip-icon">{eng.icon}</span>
            <span className="engine-chip-text">{eng.shortName}</span>
          </button>
        ))}
      </nav>

      {/* ── STUDIO BODY (DOCKABLE LAYOUT) ── */}
      <div className="studio-body">
        {/* Backdrop for open slide-over drawers: ONLY ON MOBILE, ZERO BLUR */}
        {isMobile && (isLeftDrawerOpen || isRightDrawerOpen) && (
          <div
            className="studio-drawer-backdrop"
            onClick={() => {
              setIsLeftDrawerOpen(false);
              setIsRightDrawerOpen(false);
            }}
          />
        )}

        {/* 280px Collapsible Catalog Drawer (Slide-Over from Left) */}
        {isLeftDrawerOpen && (
          <div className="studio-catalog-drawer">
              {/* Segmented Top Tab Switcher */}
              <div className="catalog-tab-switcher">
                <button
                  type="button"
                  className={`catalog-tab-btn ${catalogDrawerTab === 'investigations' ? 'active' : ''}`}
                  onClick={() => setCatalogDrawerTab('investigations')}
                >
                  📁 Investigations
                </button>
                <button
                  type="button"
                  className={`catalog-tab-btn ${catalogDrawerTab === 'cohorts' ? 'active' : ''}`}
                  onClick={() => setCatalogDrawerTab('cohorts')}
                >
                  🏷️ Cohorts ({segments.length})
                </button>
              </div>

              <div className="catalog-header">
                <span className="catalog-header-title">
                  {catalogDrawerTab === 'investigations' ? 'Workspaces & Runs' : 'Discovery Cohorts'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {catalogDrawerTab === 'investigations' && (
                    <button
                      type="button"
                      className="btn-dock-toggle"
                      style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                      onClick={() => {
                        setNewFolderName('');
                        setNewFolderParentId('');
                        setIsFolderModalOpen(true);
                      }}
                      title="Create new investigation folder"
                    >
                      + Folder
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-dock-toggle"
                    style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                    onClick={() => setIsLeftDrawerOpen(false)}
                    title="Close Catalog Drawer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="catalog-search-box">
                <input
                  type="text"
                  className="catalog-search-input"
                  placeholder={
                    catalogDrawerTab === 'investigations'
                      ? 'Filter folders & saved runs...'
                      : 'Filter cohort segments...'
                  }
                  value={searchCatalogQuery}
                  onChange={(e) => setSearchCatalogQuery(e.target.value)}
                />
              </div>

              <div className="catalog-content-scroll">
                {catalogDrawerTab === 'investigations' ? (
                  <div className="catalog-tree">
                    {renderFolderTree(folders)}
                  </div>
                ) : (
                  <div className="catalog-cohorts-container">
                    {renderSegmentsList()}
                  </div>
                )}
              </div>
            </div>
          )}

        {/* CENTER WRAPPER: Canvas + Docked Action Bar */}
        <div className="studio-center-wrapper">
          {/* CENTER DYNAMIC MULTI-ENGINE CANVAS */}
          <main className="studio-center-canvas">
          {/* Active Investigation Session Banner */}
          {loadedInvestigation && (
            <div className="active-investigation-banner">
              <div className="active-banner-left">
                <span className="active-banner-badge">📂 Active Run</span>
                <strong className="active-banner-title">{loadedInvestigation.name}</strong>
                <span className="active-banner-meta">
                  ({getEngineIcon(loadedInvestigation.engine_type)} {loadedInvestigation.engine_type} &bull; Hydrated)
                </span>
              </div>
              <div className="active-banner-actions">
                <button
                  type="button"
                  className="active-banner-reset-btn"
                  onClick={handleResetToDefault}
                  title="Reset workspace parameters to default factory state"
                >
                  ↺ Reset to Default
                </button>
              </div>
            </div>
          )}

          {/* Hero Banner for Active Engine */}
          <div className="canvas-hero-card">
            <div className="canvas-hero-left">
              <div className="hero-engine-icon">{activeEngine.icon}</div>
              <div>
                <h2 className="hero-engine-title">{activeEngine.title}</h2>
                <p className="hero-engine-desc">
                  <strong>Target Objective:</strong> {activeEngine.objective} — {activeEngine.description}
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className="telemetry-chip">
                {isSimulating ? '⚡ Recalculating Matrix...' : '🟢 Active Stream Ready'}
              </span>
            </div>
          </div>

          {/* Active Visualizer Shell */}
          <div className="canvas-view-container">
            <div className="engine-visualizer-shell">
              {/* 8TH ENGINE: AD-HOC RELATIONAL DISCOVERY & QUERY WORKBENCH CARD */}
              {activeEngineId === 'adhoc' && (
                <div className="adhoc-workbench-card span-full">
                  <div className="adhoc-workbench-header">
                    <div className="adhoc-workbench-title-group">
                      <span style={{ fontSize: '1.2rem' }}>🔍</span>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f1f5f9' }}>
                          Ad-Hoc Relational Discovery &amp; Query Workbench
                        </h3>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          Multi-hop relational joins: Customer → Address → Order → OrderItem → DeliveryItem (Strict decoupled reconciliation)
                        </span>
                      </div>
                    </div>

                    <div className="adhoc-mode-toggle">
                      <button
                        type="button"
                        className={`adhoc-mode-btn ${adhocInputMode === 'natural' ? 'active' : ''}`}
                        onClick={() => setAdhocInputMode('natural')}
                      >
                        💬 Natural Retail English
                      </button>
                      <button
                        type="button"
                        className={`adhoc-mode-btn ${adhocInputMode === 'tokens' ? 'active' : ''}`}
                        onClick={() => setAdhocInputMode('tokens')}
                      >
                        🧩 Relational Tokens
                      </button>
                    </div>
                  </div>

                  {/* Quick Presets Bar */}
                  <div className="adhoc-presets-bar">
                    <span className="adhoc-preset-label">Quick Presets:</span>
                    {ADHOC_PRESETS.map((preset, pIdx) => {
                      const isPresetActive = adhocTokens.village === preset.tokens.village && adhocTokens.product === preset.tokens.product;
                      return (
                        <button
                          key={pIdx}
                          type="button"
                          className={`adhoc-preset-chip ${isPresetActive ? 'active-preset' : ''}`}
                          onClick={() => {
                            setAdhocQueryInput(preset.query);
                            setAdhocTokens(preset.tokens);
                            setParams((prev) => ({
                              ...prev,
                              adhoc: {
                                ...prev.adhoc,
                                ...preset.tokens,
                                query: preset.query,
                              },
                            }));
                          }}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Dual Input Area */}
                  {adhocInputMode === 'natural' ? (
                    <div className="adhoc-natural-input-wrap">
                      <textarea
                        className="adhoc-query-textarea"
                        value={adhocQueryInput}
                        onChange={(e) => setAdhocQueryInput(e.target.value)}
                        placeholder="e.g. get all customers from village krushnapur who has ordered apsara pencil at price 55 and and that pencil is not delivered (something else might be delivered) but leave out those with some of the pencils are delivered."
                        rows={2}
                      />
                      <button
                        type="button"
                        className="adhoc-query-exec-btn"
                        disabled={isSimulating}
                        onClick={() => {
                          setParams((prev) => ({
                            ...prev,
                            adhoc: {
                              ...prev.adhoc,
                              query: adhocQueryInput,
                            },
                          }));
                        }}
                      >
                        <span>⚡</span>
                        <span>{isSimulating ? 'Executing...' : 'Run Query'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="adhoc-tokens-container">
                      <div className="adhoc-token-item">
                        <span className="adhoc-token-tag">Target Entity</span>
                        <select
                          className="adhoc-token-input"
                          value={adhocTokens.entity}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAdhocTokens((prev) => ({ ...prev, entity: val }));
                            handleParamChange('adhoc', 'entity', val);
                          }}
                        >
                          <option value="customer">Customers (Individual/School)</option>
                          <option value="order">Orders (Purchases)</option>
                          <option value="product">Products (Catalog SKUs)</option>
                        </select>
                      </div>

                      <div className="adhoc-token-item">
                        <span className="adhoc-token-tag">Village / Territory</span>
                        <input
                          type="text"
                          className="adhoc-token-input"
                          value={adhocTokens.village || ''}
                          placeholder="e.g. Krushnapur"
                          onChange={(e) => {
                            const val = e.target.value;
                            setAdhocTokens((prev) => ({ ...prev, village: val }));
                            handleParamChange('adhoc', 'village', val);
                          }}
                        />
                      </div>

                      <div className="adhoc-token-item">
                        <span className="adhoc-token-tag">Ordered Line Item</span>
                        <input
                          type="text"
                          className="adhoc-token-input"
                          value={adhocTokens.product || ''}
                          placeholder="e.g. Apsara Pencil"
                          onChange={(e) => {
                            const val = e.target.value;
                            setAdhocTokens((prev) => ({ ...prev, product: val }));
                            handleParamChange('adhoc', 'product', val);
                          }}
                        />
                      </div>

                      <div className="adhoc-token-item">
                        <span className="adhoc-token-tag">Unit Price (₹)</span>
                        <input
                          type="number"
                          className="adhoc-token-input"
                          value={adhocTokens.price != null ? adhocTokens.price : ''}
                          placeholder="55"
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setAdhocTokens((prev) => ({ ...prev, price: val }));
                            handleParamChange('adhoc', 'price', val);
                          }}
                        />
                      </div>

                      <div className="adhoc-token-item" style={{ minWidth: '220px' }}>
                        <span className="adhoc-token-tag">Line Fulfillment</span>
                        <select
                          className="adhoc-token-input"
                          value={adhocTokens.fulfillment || 'undelivered_strict'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAdhocTokens((prev) => ({ ...prev, fulfillment: val }));
                            handleParamChange('adhoc', 'fulfillment', val);
                          }}
                        >
                          <option value="undelivered_strict">Undelivered (0%) | Exclude Partial</option>
                          <option value="partial">Partial Deliveries Only</option>
                          <option value="delivered">100% Fully Delivered</option>
                          <option value="any">Any Fulfillment Status</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        className="adhoc-query-exec-btn"
                        style={{ height: '36px', alignSelf: 'flex-end' }}
                        disabled={isSimulating}
                        onClick={() => {
                          setParams((prev) => ({
                            ...prev,
                            adhoc: {
                              ...prev.adhoc,
                              ...adhocTokens,
                            },
                          }));
                        }}
                      >
                        <span>⚡ Apply Tokens</span>
                      </button>
                    </div>
                  )}

                  {/* Semantic Query Interpretation Banner */}
                  {(computeData?.query_interpretation || computeData?.summary?.query_interpretation) && (
                    <div className="adhoc-interpretation-card">
                      <span className="adhoc-interpretation-icon">🔍</span>
                      <div className="adhoc-interpretation-text">
                        <strong>Parsed Relational Query:</strong>{' '}
                        {computeData.query_interpretation || computeData.summary.query_interpretation}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Metric KPI Banner */}
              <div className="visualizer-card span-full">
                <div className="visualizer-card-header">
                  <h3 className="visualizer-card-title">
                    <span>📊</span>
                    <span>Executive Engine Telemetry</span>
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Normalized Academic Cycle Baseline
                  </span>
                </div>

                <div className="metric-grid-4">
                  {(computeData?.metrics && computeData.engine === activeEngineId
                    ? computeData.metrics
                    : activeEngine.metrics
                  ).map((m, idx) => (
                    <div key={idx} className="metric-box">
                      <div className="metric-box-label">{m.label}</div>
                      <div className="metric-box-value">{m.value}</div>
                      <div className="metric-box-sub">{m.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile Viewport Segmented Control (Solves Mobile Screen Pixel Austerity) */}
              {isMobile && (
                <div className="studio-mobile-view-tabs">
                  <button
                    type="button"
                    className={`mobile-tab-btn ${mobileActiveTab === 'table' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('table')}
                  >
                    <span>📋 Operational Items ({computeData?.items?.length || 0})</span>
                  </button>
                  <button
                    type="button"
                    className={`mobile-tab-btn ${mobileActiveTab === 'visualizer' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('visualizer')}
                  >
                    <span>📈 Chart View</span>
                  </button>
                </div>
              )}

              {/* 1. DEDICATED COHORT & SEGMENT VISUALIZER CARD */}
              {(!isMobile || mobileActiveTab === 'visualizer') && (
                <div className="visualizer-card span-full studio-chart-card">
                  <div className="visualizer-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.1rem' }}>📈</span>
                      <h3 className="visualizer-card-title">
                        {activeEngine.shortName} Cohort &amp; Distribution Visualizer
                      </h3>
                      {selectedItem && (
                        <span className="selected-filter-badge">
                          <span>Spotlight: <strong>{selectedItem.entity}</strong></span>
                          <button
                            type="button"
                            className="clear-spotlight-btn"
                            onClick={() => setSelectedEntityId(null)}
                            title="Clear entity spotlight"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="telemetry-chip">
                        {isSimulating ? '⚡ Recalculating Matrix...' : 'Interactive Node Selection (Option A)'}
                      </span>
                      <button
                        type="button"
                        className="chart-toggle-btn"
                        onClick={() => setIsChartMinimized(!isChartMinimized)}
                        title={isChartMinimized ? 'Expand chart viewport' : 'Minimize chart viewport'}
                      >
                        {isChartMinimized ? '⤢ Expand' : '⤡ Minimize'}
                      </button>
                    </div>
                  </div>

                  {!isChartMinimized && (
                    <div className="studio-chart-content">
                      <StudioVisualizer
                        activeEngineId={activeEngineId}
                        computeData={computeData}
                        selectedEntityId={selectedEntityId}
                        onSelectEntity={handleSelectEntity}
                        isMobile={isMobile}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 2. DYNAMIC ENGINE WORKSPACE TABLE AREA */}
              {(!isMobile || mobileActiveTab === 'table') && (
                <div className="visualizer-card span-full">
                  <div className="visualizer-card-header">
                    <h3 className="visualizer-card-title">
                      <span>📋</span>
                      <span>
                        {studioMode === 'quant'
                          ? `${activeEngine.shortName} Columnar Simulation Matrix (Quant Lab)`
                          : `${activeEngine.shortName} Frontline Operational View`}
                      </span>
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectedItem && (
                        <span className="selected-filter-badge">
                          <span>Active Focus: <strong>{selectedItem.entity}</strong></span>
                          <button
                            type="button"
                            className="clear-spotlight-btn"
                            onClick={() => setSelectedEntityId(null)}
                          >
                            ✕ Clear
                          </button>
                        </span>
                      )}
                      <span className="telemetry-chip">
                        {computeData?.items?.length || 0} Entities Computed
                      </span>
                    </div>
                  </div>

                  {/* Frontline View: Mobile Touch Cards or Desktop Table */}
                  {isMobile ? (
                    <div className="studio-mobile-card-stack">
                      {computeData?.items && computeData.engine === activeEngineId && computeData.items.length > 0 ? (
                        computeData.items.map((row, idx) => {
                          const isRowSelected = row.id === selectedEntityId;
                          return (
                            <div
                              key={row.id || idx}
                              className={`studio-mobile-card ${isRowSelected ? 'selected' : ''}`}
                              onClick={() => handleSelectEntity(row.id)}
                            >
                              <div className="mobile-card-header">
                                <div className="mobile-card-title-group">
                                  <strong className="mobile-card-title">{row.entity}</strong>
                                  <span className="mobile-card-category">{row.category}</span>
                                </div>
                                <span className={`telemetry-chip ${isRowSelected ? 'pulse' : ''}`}>
                                  {row.lever}
                                </span>
                              </div>
                              <div className="mobile-card-grid">
                                <div className="mobile-grid-cell">
                                  <span className="mobile-grid-label">Baseline</span>
                                  <span className="mobile-grid-val">{row.baseline}</span>
                                </div>
                                <div className="mobile-grid-cell">
                                  <span className="mobile-grid-label">Target</span>
                                  <span className="mobile-grid-val">{row.target}</span>
                                </div>
                                <div className="mobile-grid-cell full-width">
                                  <span className="mobile-grid-label">Variance</span>
                                  <span
                                    className="mobile-grid-val"
                                    style={{ color: row.variance && row.variance.includes('-') ? '#f87171' : '#10b981', fontWeight: 700 }}
                                  >
                                    {row.variance}
                                  </span>
                                </div>
                              </div>

                              <div className="mobile-card-actions">
                                <button
                                  type="button"
                                  className="mobile-card-action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectEntity(row.id);
                                    if (activeEngineId === 'demand') {
                                      handleLaunchPOHandoff();
                                    } else if (activeEngineId === 'adhoc') {
                                      setActiveModal('route_sheet');
                                    } else if (activeEngineId === 'village') {
                                      if (row.target?.includes('FRONTIER')) {
                                        setActiveModal('route_sheet');
                                      } else {
                                        setActiveModal('outlet_manifest');
                                      }
                                    } else if (activeEngineId === 'andon') {
                                      setActiveModal('andon_control_room');
                                    } else {
                                      setSaveToastMsg(`Spotlighted: ${row.entity}`);
                                      setTimeout(() => setSaveToastMsg(''), 3000);
                                    }
                                  }}
                                >
                                  <span>⚡ {row.lever || 'Focus Entity'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                          {isSimulating ? 'Calculating matrix vectors...' : 'No entities found.'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="studio-data-table">
                      <thead>
                        {activeEngineId === 'adhoc' ? (
                          <tr>
                            <th>Customer &amp; Contact</th>
                            <th>Village &amp; Territory</th>
                            <th>Order #</th>
                            <th>Line Item &amp; Unit Price</th>
                            <th>Ordered</th>
                            <th>Delivered</th>
                            <th>Starved Shortfall</th>
                            <th>Line Fulfillment</th>
                            <th>Fulfillment Lever</th>
                          </tr>
                        ) : (
                          <tr>
                            <th>Entity / Target Item</th>
                            <th>Category / Region</th>
                            <th>Current Baseline</th>
                            <th>Simulated Target</th>
                            <th>Variance / Impact</th>
                            <th>Fulfillment Lever</th>
                            {studioMode === 'quant' && <th>Quant Diagnostics</th>}
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {computeData?.items && computeData.engine === activeEngineId && computeData.items.length > 0 ? (
                          computeData.items.map((row, idx) => {
                            const isRowSelected = row.id === selectedEntityId;
                            if (activeEngineId === 'adhoc') {
                              return (
                                <tr
                                  key={row.id || idx}
                                  className={isRowSelected ? 'selected-entity-row' : ''}
                                  onClick={() => handleSelectEntity(row.id)}
                                  style={{ cursor: 'pointer' }}
                                  title="Click to spotlight customer and prime delivery run-sheet lever"
                                >
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {isRowSelected && <span style={{ color: '#f59e0b' }}>👉</span>}
                                      <div>
                                        <strong>{row.customer_name || row.entity}</strong>
                                        {row.phone && <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>📞 {row.phone}</span>}
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>{row.village || row.category}</span>
                                  </td>
                                  <td>
                                    <code style={{ color: '#f59e0b', fontSize: '0.75rem' }}>#{row.order_display_id || row.id}</code>
                                  </td>
                                  <td>
                                    <div>
                                      <strong>{row.product_name || 'Item'}</strong>
                                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>@ ₹{row.unit_price}</span>
                                    </div>
                                  </td>
                                  <td>{row.ordered_qty} pcs</td>
                                  <td>
                                    <span className="badge-undelivered">
                                      {row.delivered_qty} pcs (0%)
                                    </span>
                                  </td>
                                  <td>
                                    <span className="badge-shortfall">
                                      -{row.shortfall_qty} pcs (₹{Math.round((row.shortfall_qty || 0) * (row.unit_price || 0))})
                                    </span>
                                  </td>
                                  <td>
                                    <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
                                      {row.fulfillment_desc || '0% Delivered (Strict)'}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`telemetry-chip ${isRowSelected ? 'pulse' : ''}`}>
                                      {row.lever || 'Delivery Run-Sheet (Stream 2)'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr
                                key={row.id || idx}
                                className={isRowSelected ? 'selected-entity-row' : ''}
                                onClick={() => handleSelectEntity(row.id)}
                                style={{ cursor: 'pointer' }}
                                title="Click to spotlight entity and prime fulfillment lever"
                              >
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {isRowSelected && <span style={{ color: '#f59e0b' }}>👉</span>}
                                    <strong>{row.entity}</strong>
                                  </div>
                                </td>
                                <td>{row.category}</td>
                                <td>{row.baseline}</td>
                                <td>{row.target}</td>
                                <td>
                                  <span style={{ color: row.variance && row.variance.includes('-') ? '#f87171' : '#10b981' }}>
                                    {row.variance}
                                  </span>
                                </td>
                                <td>
                                  <span className={`telemetry-chip ${isRowSelected ? 'pulse' : ''}`}>
                                    {row.lever}
                                  </span>
                                </td>
                                {studioMode === 'quant' && (
                                  <td>
                                    <code style={{ fontSize: '0.72rem', color: '#38bdf8' }}>
                                      {row.quant_details
                                        ? Object.entries(row.quant_details)
                                            .filter(([k]) => k !== 'pitch_script')
                                            .slice(0, 3)
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(' | ')
                                        : 'Active'}
                                    </code>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={activeEngineId === 'adhoc' ? 9 : (studioMode === 'quant' ? 7 : 6)} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                              {isSimulating ? 'Calculating matrix vectors...' : 'Ready for simulation. Adjust parameters on the right inspector.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ── DOCKED BOTTOM ACTION LEVERS BAR (Tim & Store Manager's Physical Levers) ── */}
        <footer className="studio-action-levers-bar">
            <div className="levers-summary">
              {selectedItem ? (
                <>
                  <span>Spotlight: <strong style={{ color: '#f59e0b' }}>{selectedItem.entity}</strong> ({selectedItem.category})</span>
                  <span>•</span>
                  <span>Action: <strong>{selectedItem.lever || 'Direct Action'}</strong></span>
                </>
              ) : (
                <>
                  <span><strong>Selected Cohort:</strong> {computeData?.items?.length || 0} Entities Active</span>
                  <span>•</span>
                  <span><strong>Logistics Target:</strong> Established Outlets &amp; Frontier Routes</span>
                </>
              )}
            </div>

            <div className="levers-button-group">
              <button
                className={`lever-btn lever-btn-po ${((activeEngineId === 'demand' || activeEngineId === 'adhoc') && (selectedItem || (computeData?.items && computeData.items.length > 0))) ? 'primed' : ''}`}
                onClick={handleLaunchPOHandoff}
                title="Dispatch quantized purchase order directly to CreatePO"
              >
                <span>📦</span>
                <span>{selectedItem && (activeEngineId === 'demand' || activeEngineId === 'adhoc') ? '1-Tap PO (Selected)' : '1-Tap Create PO'}</span>
              </button>

              <button
                className={`lever-btn lever-btn-outlet ${activeEngineId === 'village' && selectedItem && !selectedItem.target?.includes('FRONTIER') ? 'primed' : ''}`}
                onClick={() => setActiveModal('outlet_manifest')}
                title="Generate Stream 1 bulk outlet tempo transfer manifest"
              >
                <span>🚚</span>
                <span>Outlet Staging Manifest (Stream 1)</span>
              </button>

              <button
                className={`lever-btn lever-btn-route ${(activeEngineId === 'adhoc' || (activeEngineId === 'village' && selectedItem && selectedItem.target?.includes('FRONTIER'))) ? 'primed' : ''}`}
                onClick={() => setActiveModal('route_sheet')}
                title="Generate Stream 2 delivery run-sheet populated with customer shortfall"
              >
                <span>🚚</span>
                <span>{activeEngineId === 'adhoc' ? 'Outlet / Delivery Run-Sheet (Stream 2)' : 'Door-to-Door Run-Sheet (Stream 2)'}</span>
              </button>

              <button
                className="lever-btn lever-btn-save"
                onClick={handleOpenSaveModal}
                title="Persist analytical parameters into SavedAnalysis"
              >
                <span>💾</span>
                <span>Save Analysis</span>
              </button>
            </div>
          </footer>
        </div>

        {/* RIGHT DOCK: Contextual Parameter & Slider Drawer */}
        {isRightDrawerOpen && (
          <aside className="studio-right-dock">
            <div className="inspector-header">
              <h4>Parameters &amp; What-If</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="telemetry-chip">Live Slider Sync</span>
                <button
                  type="button"
                  className="btn-dock-toggle"
                  style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                  onClick={() => setIsRightDrawerOpen(false)}
                  title="Close inspector"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="inspector-body">
              {activeEngineId === 'demand' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Safety Stock Days:</span>
                      <span className="param-value-tag">{params.demand.safetyDays} Days</span>
                    </div>
                    <input
                      type="range"
                      min="7"
                      max="30"
                      value={params.demand.safetyDays}
                      onChange={(e) => handleParamChange('demand', 'safetyDays', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Buffer for supplier delivery variance in Gujarat peak rush.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Lead Time Buffer:</span>
                      <span className="param-value-tag">{params.demand.leadTime} Days</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="14"
                      value={params.demand.leadTime}
                      onChange={(e) => handleParamChange('demand', 'leadTime', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Vendor transshipment transit duration.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>May Rush Surge Multiplier:</span>
                      <span className="param-value-tag">{params.demand.surgeMultiplier}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="4.0"
                      step="0.1"
                      value={params.demand.surgeMultiplier}
                      onChange={(e) => handleParamChange('demand', 'surgeMultiplier', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Academic syllabus concentration multiplier.</span>
                  </div>
                </>
              )}

              {activeEngineId === 'cross_sell' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Min Support Threshold:</span>
                      <span className="param-value-tag">{Math.round(params.cross_sell.minSupport * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="0.30"
                      step="0.01"
                      value={params.cross_sell.minSupport}
                      onChange={(e) => handleParamChange('cross_sell', 'minSupport', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Frequency filter for curriculum bundle co-occurrences.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Min Confidence Level:</span>
                      <span className="param-value-tag">{Math.round(params.cross_sell.minConfidence * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.90"
                      step="0.05"
                      value={params.cross_sell.minConfidence}
                      onChange={(e) => handleParamChange('cross_sell', 'minConfidence', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Probability of purchasing consequent item given antecedent basket.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Min Lift Ratio:</span>
                      <span className="param-value-tag">{params.cross_sell.minLift}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="4.0"
                      step="0.1"
                      value={params.cross_sell.minLift}
                      onChange={(e) => handleParamChange('cross_sell', 'minLift', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Affinity multiplier relative to independent baseline demand.</span>
                  </div>
                </>
              )}

              {activeEngineId === 'village' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Min Order Value:</span>
                      <span className="param-value-tag">₹{params.village.minOrderValue}</span>
                    </div>
                    <input
                      type="range"
                      min="500"
                      max="5000"
                      step="250"
                      value={params.village.minOrderValue}
                      onChange={(e) => handleParamChange('village', 'minOrderValue', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Filter qualifying door-to-door high-value student cohorts.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Target Villages Scope:</span>
                      <span className="param-value-tag">{params.village.targetVillages} Villages</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="25"
                      value={params.village.targetVillages}
                      onChange={(e) => handleParamChange('village', 'targetVillages', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Territory expansion deployment scope.</span>
                  </div>
                </>
              )}

              {activeEngineId === 'pricing' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Simulated Price Delta:</span>
                      <span className="param-value-tag">{params.pricing.priceDeltaPct > 0 ? `+${params.pricing.priceDeltaPct}` : params.pricing.priceDeltaPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      value={params.pricing.priceDeltaPct}
                      onChange={(e) => handleParamChange('pricing', 'priceDeltaPct', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Simulate customer volume attrition vs net margin profit.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Gross Margin Floor:</span>
                      <span className="param-value-tag">{params.pricing.marginFloor}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="25"
                      value={params.pricing.marginFloor}
                      onChange={(e) => handleParamChange('pricing', 'marginFloor', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Protects against loss-leader pricing below landed cost.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Elasticity Prior (β₀):</span>
                      <span className="param-value-tag">{params.pricing.elasticityPrior}</span>
                    </div>
                    <input
                      type="range"
                      min="-2.0"
                      max="-0.2"
                      step="0.05"
                      value={params.pricing.elasticityPrior}
                      onChange={(e) => handleParamChange('pricing', 'elasticityPrior', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Bayesian shrinkage prior for small-sample syllabus items.</span>
                  </div>
                </>
              )}

              {activeEngineId === 'defects' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Laplace Alpha (α):</span>
                      <span className="param-value-tag">{params.defects.laplaceAlpha}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="5.0"
                      step="0.5"
                      value={params.defects.laplaceAlpha}
                      onChange={(e) => handleParamChange('defects', 'laplaceAlpha', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Laplace pseudo-count defect prior smoothing.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Laplace Beta (β):</span>
                      <span className="param-value-tag">{params.defects.laplaceBeta}</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="200"
                      step="10"
                      value={params.defects.laplaceBeta}
                      onChange={(e) => handleParamChange('defects', 'laplaceBeta', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Laplace pseudo-count clean units prior smoothing.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Vendor Freeze Threshold:</span>
                      <span className="param-value-tag">{params.defects.freezeThreshold}%</span>
                    </div>
                    <input
                      type="range"
                      min="2.0"
                      max="12.0"
                      step="0.5"
                      value={params.defects.freezeThreshold}
                      onChange={(e) => handleParamChange('defects', 'freezeThreshold', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Defect rate ceiling triggering automatic PO freeze.</span>
                  </div>
                </>
              )}

              {activeEngineId === 'khata' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Max DSO Days:</span>
                      <span className="param-value-tag">{params.khata.maxDsoDays} Days</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="90"
                      step="5"
                      value={params.khata.maxDsoDays}
                      onChange={(e) => handleParamChange('khata', 'maxDsoDays', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Finn Protocol delinquency threshold for delivery halt.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Outlet Credit Limit:</span>
                      <span className="param-value-tag">₹{(params.khata.creditLimit / 1000).toFixed(0)}k</span>
                    </div>
                    <input
                      type="range"
                      min="10000"
                      max="150000"
                      step="5000"
                      value={params.khata.creditLimit}
                      onChange={(e) => handleParamChange('khata', 'creditLimit', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Maximum uncollected balance allowed per outlet account.</span>
                  </div>
                </>
              )}

              {activeEngineId === 'andon' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Volume Variance Latch:</span>
                      <span className="param-value-tag">±{params.andon.volumeThresholdPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="60"
                      step="5"
                      value={params.andon.volumeThresholdPct}
                      onChange={(e) => handleParamChange('andon', 'volumeThresholdPct', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Procurement volume variance tripping amber circuit latch.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Unit Cost Hike Latch:</span>
                      <span className="param-value-tag">+{params.andon.costThresholdPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="1"
                      value={params.andon.costThresholdPct}
                      onChange={(e) => handleParamChange('andon', 'costThresholdPct', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Supplier cost escalation tripping automatic review block.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Absolute Noise Floor:</span>
                      <span className="param-value-tag">{params.andon.noiseFloorQty} Units</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      step="1"
                      value={params.andon.noiseFloorQty}
                      onChange={(e) => handleParamChange('andon', 'noiseFloorQty', Number(e.target.value))}
                      className="param-slider"
                    />
                    <span className="param-hint">Minimum delta required to trip latch (suppresses penny false alarms).</span>
                  </div>
                </>
              )}

              {activeEngineId === 'adhoc' && (
                <>
                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Target Village:</span>
                      <span className="param-value-tag">{adhocTokens.village || 'All'}</span>
                    </div>
                    <input
                      type="text"
                      value={adhocTokens.village || ''}
                      placeholder="e.g. Krushnapur"
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdhocTokens((prev) => ({ ...prev, village: val }));
                        handleParamChange('adhoc', 'village', val);
                      }}
                      className="adhoc-token-input"
                      style={{ width: '100%', padding: '6px 8px' }}
                    />
                    <span className="param-hint">Resolved via OSM geographic regions and boundary polygons.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Target SKU:</span>
                      <span className="param-value-tag">{adhocTokens.product || 'All SKUs'}</span>
                    </div>
                    <input
                      type="text"
                      value={adhocTokens.product || ''}
                      placeholder="e.g. Apsara Pencil"
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdhocTokens((prev) => ({ ...prev, product: val }));
                        handleParamChange('adhoc', 'product', val);
                      }}
                      className="adhoc-token-input"
                      style={{ width: '100%', padding: '6px 8px' }}
                    />
                    <span className="param-hint">Specific catalog item filter in order line items.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Unit Price Filter:</span>
                      <span className="param-value-tag">₹{adhocTokens.price != null ? adhocTokens.price : 'Any'}</span>
                    </div>
                    <input
                      type="number"
                      value={adhocTokens.price != null ? adhocTokens.price : ''}
                      placeholder="55"
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setAdhocTokens((prev) => ({ ...prev, price: val }));
                        handleParamChange('adhoc', 'price', val);
                      }}
                      className="adhoc-token-input"
                      style={{ width: '100%', padding: '6px 8px' }}
                    />
                    <span className="param-hint">Exact unit selling price recorded on order line items.</span>
                  </div>

                  <div className="param-group">
                    <div className="param-label-row">
                      <span>Line Fulfillment:</span>
                    </div>
                    <select
                      value={adhocTokens.fulfillment || 'undelivered_strict'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdhocTokens((prev) => ({ ...prev, fulfillment: val }));
                        handleParamChange('adhoc', 'fulfillment', val);
                      }}
                      className="adhoc-token-input"
                      style={{ width: '100%', padding: '6px 8px' }}
                    >
                      <option value="undelivered_strict">Undelivered (0%) | Exclude Partial</option>
                      <option value="partial">Partial Deliveries Only</option>
                      <option value="delivered">100% Fully Delivered</option>
                      <option value="any">Any Fulfillment State</option>
                    </select>
                    <span className="param-hint">Strict item-level delivery reconciliation (independent of order status).</span>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── MODALS FOR DUAL-STREAM LEVERS & PIPELINE ACTIONS (SLICE 7.4) ── */}

      {/* 1. 1-CLICK PURCHASE ORDER PIPELINE DISPATCH DIALOG */}
      {activeModal === 'dispatch_po' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass-card studio-operational-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header-row">
              <h3 style={{ margin: 0, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📦</span>
                <span>1-Click PO Pipeline Dispatch</span>
              </h3>
              <button type="button" className="clear-spotlight-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0 16px 0' }}>
              Dispatches quantized master-carton replenishment orders directly to the procurement pipeline with automated TPS Andon cord validation.
            </p>

            {dispatchError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '14px' }}>
                ⚠️ {dispatchError}
              </div>
            )}

            {dispatchResult?.transfer_id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#34d399', padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                    ✅ Pipeline Transfer Log Created Successfully!
                  </div>
                  <div>Transfer ID: <code style={{ color: '#fff' }}>{dispatchResult.transfer_id}</code></div>
                  <div>Vendor: <strong>{dispatchResult.vendor_name || 'Assigned Supplier'}</strong></div>
                  <div>Status: <strong>{dispatchResult.status}</strong> | Andon: <strong>{dispatchResult.payload_snapshot?.andon_status || 'CLEARED'}</strong></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn-dock-toggle" onClick={() => setActiveModal(null)}>Close</button>
                  <button
                    type="button"
                    className="lever-btn lever-btn-po"
                    onClick={() => navigate(`/procurement/create-po?transfer_id=${dispatchResult.transfer_id}`)}
                  >
                    <span>🚀 Open in PO Creator</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ background: 'rgba(15, 18, 32, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                    DISPATCH BATCH CANDIDATES ({selectedItem ? 'Single Spotlighted SKU' : `${dispatchPreviewItems.length} Batch SKUs`}):
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <th style={{ padding: '4px' }}>Entity</th>
                          <th style={{ padding: '4px' }}>Target Units</th>
                          <th style={{ padding: '4px' }}>Master Packs</th>
                          <th style={{ padding: '4px' }}>Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dispatchPreviewItems.map((it, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '6px 4px', fontWeight: 600, color: '#f1f5f9' }}>{it.entity}</td>
                            <td style={{ padding: '6px 4px', color: '#38bdf8' }}>{it.target}</td>
                            <td style={{ padding: '6px 4px', color: '#f59e0b' }}>{it.baseline}</td>
                            <td style={{ padding: '6px 4px', color: '#94a3b8' }}>₹{it.cost}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {dispatchResult?.is_andon_tripped && dispatchResult?.andon_status === 'TRIPPED' && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                    <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>
                      ⚠️ TPS Andon Latch Tripped — Manager Override Required
                    </div>
                    <ul style={{ margin: '0 0 10px 18px', padding: 0, fontSize: '0.75rem', color: '#cbd5e1' }}>
                      {dispatchResult.andon_trip_reasons?.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>
                      Manager Authorization Justification (min 5 characters):
                    </label>
                    <input
                      type="text"
                      value={dispatchOverrideReason}
                      onChange={(e) => setDispatchOverrideReason(e.target.value)}
                      placeholder="e.g. Approved seasonal rush textbook buffer per Principal request."
                      style={{ width: '100%', padding: '8px', background: '#0f172a', color: '#fff', border: '1px solid #f59e0b', borderRadius: '6px', fontSize: '0.8rem' }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Dispatch Notes / Reference:</label>
                  <input
                    type="text"
                    value={dispatchNotes}
                    onChange={(e) => setDispatchNotes(e.target.value)}
                    placeholder="e.g. Navneet Standard 10 April Intake Batch #1"
                    style={{ width: '100%', padding: '8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-dock-toggle"
                    onClick={() => {
                      const poItems = selectedItem ? [selectedItem] : computeData?.items || [];
                      navigate('/procurement/new', { state: { preloadedItems: poItems, sourceEngine: activeEngineId } });
                    }}
                    title="Open standard procurement draft form"
                  >
                    Open Manual PO Form ↗
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn-dock-toggle" onClick={() => setActiveModal(null)}>Cancel</button>
                    <button
                      type="button"
                      className="lever-btn lever-btn-po"
                      disabled={isDispatching}
                      onClick={handleExecuteDispatchPO}
                    >
                      {isDispatching ? '⚡ Evaluating Andon...' : '1-Click Dispatch Pipeline PO'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. REAL-TIME TPS ANDON LATCH CONTROL ROOM MODAL */}
      {activeModal === 'andon_control_room' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass-card studio-operational-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header-row">
              <h3 style={{ margin: 0, color: andonStatus === 'TRIPPED' ? '#f59e0b' : andonStatus === 'OVERRIDDEN' ? '#10b981' : '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🛡️</span>
                <span>TPS Andon Latch Control Room</span>
              </h3>
              <button type="button" className="clear-spotlight-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0 16px 0' }}>
              The Toyota Production System (TPS) automated circuit breaker protecting Books3 against volume spikes, cost surges, and margin compression.
            </p>

            {andonSuccessMsg && (
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#34d399', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '14px' }}>
                ✅ {andonSuccessMsg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(15, 18, 32, 0.8)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>CURRENT CIRCUIT STATUS</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: andonStatus === 'TRIPPED' ? '#fbbf24' : andonStatus === 'OVERRIDDEN' ? '#34d399' : '#38bdf8', marginTop: '4px' }}>
                  {andonStatus === 'TRIPPED' ? '⚠️ LATCH TRIPPED' : andonStatus === 'OVERRIDDEN' ? '🟢 OVERRIDDEN' : '🛡️ CLEARED'}
                </div>
              </div>
              <div style={{ background: 'rgba(15, 18, 32, 0.8)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>INVARIANT CEILINGS</div>
                <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.4 }}>
                  • Vol Var: <strong>±{params.andon.volumeThresholdPct}%</strong> (Noise: {params.andon.noiseFloorQty}u)<br />
                  • Cost Hike: <strong>+{params.andon.costThresholdPct}%</strong> | Season Cutoff: June 15
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(12, 14, 26, 0.9)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>
                Manager Authorization Override Protocol
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Releasing the circuit requires an explicit operational reason. This action is permanently logged to the sovereign audit trail.
              </p>
              <input
                type="text"
                value={andonOverrideReason}
                onChange={(e) => setAndonOverrideReason(e.target.value)}
                placeholder="Enter justification reason (e.g. Headmaster pre-funded emergency batch)..."
                style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '10px' }}
              />
              <button
                type="button"
                className="lever-btn lever-btn-po"
                disabled={isOverridingAndon || andonOverrideReason.trim().length < 5}
                onClick={handleStudioOverrideAndon}
                style={{ width: '100%', opacity: andonOverrideReason.trim().length < 5 ? 0.6 : 1 }}
              >
                {isOverridingAndon ? 'Authorizing Override...' : 'Authorize Manager Override & Release Circuit'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-dock-toggle" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. STREAM 1: OUTLET STAGING MANIFEST MODAL */}
      {activeModal === 'outlet_manifest' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass-card studio-operational-modal printable-modal-area" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="modal-header-row">
              <h3 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🚚</span>
                <span>Stream 1: Outlet Staging Manifest &amp; Custody Slip</span>
              </h3>
              <button type="button" className="clear-spotlight-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0 16px 0' }}>
              Central Warehouse bulk transfer staging manifest for established village outlets with master-carton cubing and employee custody sign-off.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>Destination Outlet:</label>
                <select
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
                >
                  <option value="Kaliawadi Branch Outlet (Tempo #1)">Kaliawadi Branch (Tempo #1)</option>
                  <option value="Mahuva Town Stall (Tempo #2)">Mahuva Town Stall (Tempo #2)</option>
                  <option value="Dharampur School Depo (Tempo #3)">Dharampur School Depo (Tempo #3)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>Assigned Vehicle:</label>
                <input
                  type="text"
                  value={assignedVehicle}
                  onChange={(e) => setAssignedVehicle(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>Staff Custodian:</label>
                <input
                  type="text"
                  value={assignedCustodian}
                  onChange={(e) => setAssignedCustodian(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
                />
              </div>
            </div>

            {/* Master-Carton Manifest Breakdown */}
            <div style={{ background: 'rgba(15, 18, 32, 0.85)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', padding: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: '6px' }}>
                QUANTIZED MASTER-CARTON MANIFEST BREAKDOWN
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '4px' }}>Item Specification</th>
                    <th style={{ padding: '4px' }}>Pack Size</th>
                    <th style={{ padding: '4px' }}>Master Cartons</th>
                    <th style={{ padding: '4px' }}>Total Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(computeData?.items || []).slice(0, 4).map((it, idx) => {
                    const q = it.quant_details || {};
                    const casePack = q.case_pack || 10;
                    const targetUnits = it.target ? parseInt(it.target.replace(/[^\d]/g, ''), 10) || 30 : 30;
                    const cartons = Math.ceil(targetUnits / casePack);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '6px 4px', fontWeight: 600, color: '#f1f5f9' }}>{it.entity}</td>
                        <td style={{ padding: '6px 4px', color: '#94a3b8' }}>{casePack} pcs/pack</td>
                        <td style={{ padding: '6px 4px', fontWeight: 700, color: '#f59e0b' }}>{cartons} Cartons</td>
                        <td style={{ padding: '6px 4px', color: '#38bdf8' }}>{cartons * casePack} Units</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Signature Block for Print */}
            <div className="manifest-signature-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px', padding: '12px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Warehouse Dispatcher:</div>
                <div style={{ height: '30px', borderBottom: '1px solid #64748b', marginTop: '6px' }}></div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>Sign &amp; Timestamp</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Outlet Receiving Custodian:</div>
                <div style={{ height: '30px', borderBottom: '1px solid #64748b', marginTop: '6px' }}></div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>Sign &amp; Physical Count Verification</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button type="button" className="btn-dock-toggle" onClick={() => setActiveModal(null)}>Cancel</button>
              <button type="button" className="btn-dock-toggle" onClick={handleExportManifestCSV}>
                <span>📥 Export Manifest CSV</span>
              </button>
              <button
                type="button"
                className="lever-btn lever-btn-outlet"
                onClick={() => window.print()}
              >
                <span>📄 Print Custody Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. STREAM 2: FRONTIER VILLAGE DOOR-TO-DOOR RUN-SHEET MODAL */}
      {activeModal === 'route_sheet' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass-card studio-operational-modal printable-modal-area" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="modal-header-row">
              <h3 style={{ margin: 0, color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏠</span>
                <span>Stream 2: Frontier Village Door-to-Door Delivery Run-Sheet</span>
              </h3>
              <button type="button" className="clear-spotlight-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0 16px 0' }}>
              Field order aggregation and driver Cash-on-Delivery (COD) run-sheet for frontier village home distribution.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>Target Village Sector:</label>
                <select
                  value={selectedVillage}
                  onChange={(e) => setSelectedVillage(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
                >
                  {activeEngineId === 'adhoc' && computeData?.tokens?.village ? (
                    <option value={computeData.tokens.village}>
                      {computeData.tokens.village} ({computeData.items?.length || 0} Starved Orders)
                    </option>
                  ) : null}
                  <option value="Dharampur Frontier Sector">Dharampur Frontier Sector (48 Students)</option>
                  <option value="Vansda Rural Block">Vansda Rural Block (36 Students)</option>
                  <option value="Chikhli Cluster">Chikhli Cluster (52 Students)</option>
                  <option value="Kaliawadi Rural Outskirts">Kaliawadi Rural Outskirts (40 Students)</option>
                </select>
              </div>

              <button
                type="button"
                className="btn-dock-toggle"
                onClick={handleCopyWhatsAppBroadcast}
                title="Copy WhatsApp announcement message for parents"
                style={{ height: '36px', alignSelf: 'flex-end', color: copiedWhatsApp ? '#34d399' : '#38bdf8' }}
              >
                <span>{copiedWhatsApp ? '✅ Broadcast Copied!' : '📋 Copy WhatsApp Broadcast'}</span>
              </button>
            </div>

            {/* Run-sheet stops preview table */}
            <div style={{ background: 'rgba(15, 18, 32, 0.85)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', padding: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#34d399', marginBottom: '8px' }}>
                <span>DRIVER STOP SEQUENCE &amp; COD TARGETS</span>
                <span>
                  Total Cash Target: ₹{activeEngineId === 'adhoc' && computeData?.summary?.unfulfilled_value != null ? Number(computeData.summary.unfulfilled_value).toLocaleString() : '7,190'}
                </span>
              </div>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '4px' }}>Stop</th>
                    <th style={{ padding: '4px' }}>Student / Family</th>
                    <th style={{ padding: '4px' }}>Kit Bundle</th>
                    <th style={{ padding: '4px' }}>COD Due</th>
                    <th style={{ padding: '4px' }}>Khata</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEngineId === 'adhoc' && computeData?.items && computeData.items.length > 0 ? (
                    computeData.items.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '6px 4px', color: '#f59e0b', fontWeight: 700 }}>#{String(idx + 1).padStart(2, '0')}</td>
                        <td style={{ padding: '6px 4px', fontWeight: 600, color: '#f1f5f9' }}>
                          {row.customer_name || row.entity}
                          {row.phone && <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>📞 {row.phone}</span>}
                        </td>
                        <td style={{ padding: '6px 4px', color: '#94a3b8' }}>
                          {row.product_name || 'Starved Item'} ({row.shortfall_qty} units starved)
                        </td>
                        <td style={{ padding: '6px 4px', fontWeight: 700, color: '#34d399' }}>
                          ₹{Math.round((row.shortfall_qty || 1) * (row.unit_price || 55)).toLocaleString()}
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                            UNDELIVERED (0%)
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    [
                      { stop: '01', name: 'Patel Aarav', kit: 'Std 10 Complete Syllabus Kit', cod: '₹1,840', khata: 'CLEARED' },
                      { stop: '02', name: 'Desai Diya', kit: 'Std 10 Science & Math Bundle', cod: '₹1,220', khata: 'CLEARED' },
                      { stop: '03', name: 'Shah Vivaan', kit: 'Std 10 Complete Syllabus Kit', cod: '₹1,840', khata: 'CLEARED' },
                      { stop: '04', name: 'Chaudhari Ananya', kit: 'Std 10 Stationery Pack', cod: '₹450', khata: 'WARNING' },
                      { stop: '05', name: 'Tandel Aryan', kit: 'Std 10 Complete Syllabus Kit', cod: '₹1,840', khata: 'CLEARED' },
                    ].map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '6px 4px', color: '#f59e0b', fontWeight: 700 }}>#{row.stop}</td>
                        <td style={{ padding: '6px 4px', fontWeight: 600, color: '#f1f5f9' }}>{row.name}</td>
                        <td style={{ padding: '6px 4px', color: '#94a3b8' }}>{row.kit}</td>
                        <td style={{ padding: '6px 4px', fontWeight: 700, color: '#34d399' }}>{row.cod}</td>
                        <td style={{ padding: '6px 4px' }}>
                          <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: row.khata === 'CLEARED' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: row.khata === 'CLEARED' ? '#34d399' : '#fbbf24' }}>
                            {row.khata}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn-dock-toggle" onClick={() => setActiveModal(null)}>Cancel</button>
              <button type="button" className="btn-dock-toggle" onClick={handleExportRunSheetCSV}>
                <span>📥 Export Driver Run-Sheet (CSV)</span>
              </button>
              <button
                type="button"
                className="lever-btn lever-btn-route"
                onClick={() => window.print()}
              >
                <span>📄 Print Delivery Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SAVE INVESTIGATION MODAL (RICH SNAPSHOT & COHORT FORKING) */}
      {activeModal === 'save_investigation' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content glass-card studio-operational-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header-row">
              <h3 style={{ margin: 0, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💾</span>
                <span>Save Investigation Snapshot</span>
              </h3>
              <button type="button" className="clear-spotlight-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0 16px 0' }}>
              Persists active parameter matrix, simulated cohorts, and telemetry into <code>SavedAnalysis</code> for team collaboration and workspace hydration.
            </p>

            {saveErrorMsg && (
              <div className="save-error-alert" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', color: '#fca5a5', marginBottom: '14px' }}>
                ⚠️ {saveErrorMsg}
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Investigation Name:</label>
              <input
                type="text"
                value={saveAnalysisName}
                onChange={(e) => setSaveAnalysisName(e.target.value)}
                placeholder="e.g. Q2 Seasonal Surge Analysis"
                style={{ width: '100%', padding: '8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Workspace Folder:</label>
              <select
                value={saveAnalysisFolderId}
                onChange={(e) => setSaveAnalysisFolderId(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
              >
                <option value="">General Investigations (Root)</option>
                {folders.filter(f => !f.is_virtual).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Optional Discovery Cohort Forking */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>
                <input
                  type="checkbox"
                  checked={isForkingCohort}
                  onChange={(e) => setIsForkingCohort(e.target.checked)}
                />
                <span>Fork entities into permanent Discovery Cohort</span>
              </label>

              {isForkingCohort && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '2px' }}>Cohort Label:</label>
                    <input
                      type="text"
                      value={forkCohortName}
                      onChange={(e) => setForkCohortName(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.78rem' }}
                    />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Target: <strong style={{ color: '#38bdf8' }}>{forkCohortTarget}</strong></span>
                    <span>Capturing: <strong style={{ color: '#f59e0b' }}>{Math.min(50, computeData?.items?.length || 0)} items</strong></span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn-dock-toggle" onClick={() => setActiveModal(null)}>Cancel</button>
              <button
                type="button"
                className="lever-btn lever-btn-po"
                onClick={handleExecuteSaveInvestigation}
                disabled={isSavingAnalysis}
              >
                {isSavingAnalysis ? 'Saving Snapshot...' : '💾 Save Investigation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CREATE INVESTIGATION FOLDER MODAL */}
      {isFolderModalOpen && (
        <div className="modal-overlay" onClick={() => setIsFolderModalOpen(false)}>
          <div className="modal-content glass-card studio-operational-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header-row">
              <h3 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📁</span>
                <span>Create Investigation Folder</span>
              </h3>
              <button type="button" className="clear-spotlight-btn" onClick={() => setIsFolderModalOpen(false)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '8px 0 16px 0' }}>
              Organize your quantitative analyses and scenario runs into structured workspaces.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Folder Name:</label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Q2 Back-to-School 2026"
                style={{ width: '100%', padding: '8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Parent Folder (Optional):</label>
              <select
                value={newFolderParentId}
                onChange={(e) => setNewFolderParentId(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.8rem' }}
              >
                <option value="">Root Level (No Parent)</option>
                {folders.filter(f => !f.is_virtual).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn-dock-toggle" onClick={() => setIsFolderModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="lever-btn lever-btn-po"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. FLOATING ACTION TOAST */}
      {saveToastMsg && (
        <div className="studio-floating-toast">
          <span>✨</span>
          <span>{saveToastMsg}</span>
        </div>
      )}
    </div>
  );
}
