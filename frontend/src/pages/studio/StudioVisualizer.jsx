import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  Area,
  Cell,
  Legend
} from 'recharts';

/**
 * Custom Dark-Mode Accessible Tooltip for Data Studio
 */
function StudioCustomTooltip({ active, payload, label, engineId }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload || {};

  return (
    <div style={{
      background: 'rgba(15, 18, 32, 0.96)',
      border: '1px solid rgba(180, 138, 40, 0.4)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '0.75rem',
      color: '#f1f5f9',
      maxWidth: '280px',
      backdropFilter: 'blur(8px)',
      zIndex: 1000
    }}>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f59e0b', marginBottom: '6px' }}>
        {data.name || data.entity || label || 'Item Details'}
      </div>

      {engineId === 'demand' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>Stock Cover: <strong>{data.doir ?? data.x} Days</strong></div>
          <div>Forecast Demand: <strong>{data.forecast ?? data.y} Units</strong></div>
          <div>Batch Quantity: <strong>{data.poQty ?? data.z} Units</strong></div>
          <div>Risk Status: <span style={{ color: data.risk === 'CRITICAL' ? '#ef4444' : data.risk === 'WARNING' ? '#f59e0b' : '#10b981', fontWeight: 700 }}>{data.risk}</span></div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>💡 Click to prime 1-Tap Purchase Order</div>
        </div>
      )}

      {engineId === 'cross_sell' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>Kit: <strong>{data.entity}</strong></div>
          <div>Support: <strong>{data.support}%</strong> | Confidence: <strong>{data.confidence}%</strong></div>
          <div>Lift Factor: <strong style={{ color: '#38bdf8' }}>{data.lift}x</strong></div>
          {data.price && <div>Consequent Value: <strong>₹{data.price}</strong></div>}
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>💡 Click to prime Student Kit Preset</div>
        </div>
      )}

      {engineId === 'village' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>Sector: <strong>{data.sector}</strong></div>
          <div>Revenue Momentum (RMI): <strong style={{ color: data.rmi >= 0 ? '#10b981' : '#ef4444' }}>{data.rmi > 0 ? `+${data.rmi}%` : `${data.rmi}%`}</strong></div>
          <div>Target Student Cohort: <strong>{data.students} Students</strong></div>
          <div>Quadrant: <span style={{ color: data.quadrantColor, fontWeight: 700 }}>{data.quadrant}</span></div>
          <div>Fulfillment: <strong style={{ color: '#f59e0b' }}>{data.fulfillmentStream}</strong></div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>💡 Click to prime {data.fulfillmentStream}</div>
        </div>
      )}

      {engineId === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>Price Point: <strong>₹{data.price}</strong></div>
          <div>Projected Volume: <strong>{data.volume} Units</strong></div>
          <div>Gross Margin: <strong style={{ color: '#10b981' }}>{data.margin}%</strong></div>
          {data.isProposed && <div style={{ color: '#f59e0b', fontWeight: 700 }}>★ Simulated Target Point</div>}
          {data.isCurrent && <div style={{ color: '#38bdf8', fontWeight: 700 }}>● Current Baseline Point</div>}
        </div>
      )}

      {engineId === 'defects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>Units Sold: <strong>{data.sold?.toLocaleString()}</strong></div>
          <div>Defects: <strong>{data.defects} Damaged Units</strong></div>
          <div>Smoothed Defect Rate: <strong style={{ color: data.rate >= 6.0 ? '#ef4444' : '#10b981' }}>{data.rate}%</strong></div>
          <div>Status: <span style={{ fontWeight: 700, color: data.statusColor }}>{data.status}</span></div>
          {data.rate >= 6.0 && <div style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '4px' }}>🚨 Exceeds 6.0% PO Freeze Threshold</div>}
        </div>
      )}

      {engineId === 'khata' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>City / Hub: <strong>{data.category}</strong></div>
          <div>Total Outstanding: <strong>₹{data.balance?.toLocaleString()}</strong></div>
          <div>Credit Limit: <strong>₹{data.creditLimit?.toLocaleString()}</strong></div>
          <div>DSO: <strong style={{ color: data.dso > 45 ? '#ef4444' : data.dso > 30 ? '#f59e0b' : '#10b981' }}>{data.dso} Days</strong></div>
          <div>Gate Status: <span style={{ fontWeight: 700, color: data.statusColor }}>{data.status}</span></div>
        </div>
      )}

      {engineId === 'andon' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>Line SKU: <strong>{data.name}</strong></div>
          <div>Volume Var: <strong style={{ color: Math.abs(data.volVar) > 30 ? '#ef4444' : '#cbd5e1' }}>{data.volVar > 0 ? `+${data.volVar}%` : `${data.volVar}%`}</strong> (Limit ±30%)</div>
          <div>Cost Hike: <strong style={{ color: data.costVar > 15 ? '#ef4444' : '#cbd5e1' }}>{data.costVar > 0 ? `+${data.costVar}%` : `${data.costVar}%`}</strong> (Limit +15%)</div>
          <div>Status: <span style={{ fontWeight: 700, color: data.isTripped ? '#ef4444' : '#10b981' }}>{data.isTripped ? '⚠️ ANDON LATCH TRIPPED' : '✅ Cleared'}</span></div>
        </div>
      )}
    </div>
  );
}

/**
 * Sovereign Studio Visualizer Component
 * Renders engine-specific interactive cohort and distribution charts.
 */
export default function StudioVisualizer({
  activeEngineId,
  computeData,
  selectedEntityId,
  onSelectEntity,
  isMobile
}) {
  const items = computeData?.items || [];

  // ─────────────────────────────────────────────────────────────
  // 1. DEMAND FORECAST ADAPTER
  // Scatter Plot: X = Days of Inventory Remaining (DOIR), Y = Forecast Demand, Size = PO Qty
  // ─────────────────────────────────────────────────────────────
  const demandData = useMemo(() => {
    if (activeEngineId !== 'demand' || !items.length) return [];
    return items.map((it) => {
      const q = it.quant_details || {};
      const doir = Number.isFinite(q.doir) ? q.doir : 12;
      const matchTarget = it.target ? parseInt(it.target.replace(/[^\d]/g, ''), 10) : 30;
      const forecastUnits = Number.isFinite(matchTarget) ? matchTarget : 30;
      const risk = q.stockout_risk || (doir < 7 ? 'CRITICAL' : doir < 15 ? 'WARNING' : 'HEALTHY');

      return {
        id: it.id,
        name: it.entity,
        doir: doir,
        forecast: forecastUnits,
        poQty: Math.max(10, forecastUnits),
        risk: risk,
        color: risk === 'CRITICAL' ? '#ef4444' : risk === 'WARNING' ? '#f59e0b' : '#10b981',
        leadTime: q.effective_lead_time || 5,
        isSelected: it.id === selectedEntityId
      };
    });
  }, [activeEngineId, items, selectedEntityId]);

  // ─────────────────────────────────────────────────────────────
  // 2. CROSS-SELL ADAPTER
  // Bubble / Bar Chart: Support vs Confidence vs Lift
  // ─────────────────────────────────────────────────────────────
  const crossSellData = useMemo(() => {
    if (activeEngineId !== 'cross_sell' || !items.length) return [];
    return items.map((it) => {
      const q = it.quant_details || {};
      const suppMatch = it.baseline ? parseFloat(it.baseline.replace(/[^\d.]/g, '')) : 10;
      const confMatch = it.target ? parseFloat(it.target.replace(/[^\d.]/g, '')) : 50;
      const lift = q.lift || 1.8;

      return {
        id: it.id,
        entity: it.entity,
        support: Number.isFinite(suppMatch) ? suppMatch : 10,
        confidence: Number.isFinite(confMatch) ? confMatch : 50,
        lift: lift,
        price: q.consequent_price,
        isSelected: it.id === selectedEntityId
      };
    });
  }, [activeEngineId, items, selectedEntityId]);

  // ─────────────────────────────────────────────────────────────
  // 3. VILLAGE MATRIX ADAPTER
  // 5-Tier Quadrant: X = Revenue Momentum Index (RMI %), Y = Target Students
  // ─────────────────────────────────────────────────────────────
  const villageData = useMemo(() => {
    if (activeEngineId !== 'village' || !items.length) return [];
    return items.map((it) => {
      const q = it.quant_details || {};
      const rmi = q.revenue_momentum != null ? Math.round(q.revenue_momentum * 100) : 25;
      const students = q.target_students || 40;
      const quadrant = q.quadrant || 'HIGH_GROWTH_FRONTIER';
      const isFrontier = quadrant.includes('FRONTIER');

      let qColor = '#10b981'; // Frontier (Green)
      if (quadrant === 'CORE_FORTRESS') qColor = '#38bdf8'; // Fortress (Cyan/Blue)
      if (quadrant === 'STABLE_MATURE') qColor = '#f59e0b'; // Mature (Amber)
      if (quadrant === 'AT_RISK_DEFENSIVE') qColor = '#ef4444'; // At Risk (Red)

      return {
        id: it.id,
        name: it.entity,
        sector: it.category,
        rmi: rmi,
        students: students,
        quadrant: quadrant,
        quadrantColor: qColor,
        fulfillmentStream: isFrontier ? 'Door-to-Door Run-Sheet (Stream 2)' : 'Outlet Staging Manifest (Stream 1)',
        isSelected: it.id === selectedEntityId
      };
    });
  }, [activeEngineId, items, selectedEntityId]);

  // ─────────────────────────────────────────────────────────────
  // 4. DYNAMIC PRICING ADAPTER
  // Econometric Demand & Gross Margin Curve
  // ─────────────────────────────────────────────────────────────
  const pricingData = useMemo(() => {
    if (activeEngineId !== 'pricing' || !items.length) return [];
    const firstItem = items[0] || {};
    const q = firstItem.quant_details || {};
    const elasticity = q.elasticity || -0.75;
    const baseCost = q.cost_price || 100.0;

    // Extract current price from baseline e.g. "₹160.00 (28.1% Margin)"
    const curPriceMatch = firstItem.baseline ? parseFloat(firstItem.baseline.replace(/[^\d.]/g, '')) : 150.0;
    const currentPrice = Number.isFinite(curPriceMatch) ? curPriceMatch : 150.0;

    // Generate price curve from -20% to +20% in steps of 5%
    const points = [];
    for (let pStep = -20; pStep <= 20; pStep += 5) {
      const p = Math.round(currentPrice * (1 + pStep / 100));
      const priceRatio = p / currentPrice;
      // Q = Q0 * (P / P0)^elasticity
      const vol = Math.max(10, Math.round(100 * Math.pow(priceRatio, elasticity)));
      const margin = p > baseCost ? Math.round(((p - baseCost) / p) * 100) : 0;

      points.push({
        price: p,
        volume: vol,
        margin: margin,
        isCurrent: pStep === 0,
        isProposed: pStep === 5,
        name: `${firstItem.entity} @ ₹${p}`
      });
    }
    return points;
  }, [activeEngineId, items]);

  // ─────────────────────────────────────────────────────────────
  // 5. QUALITY DEFECT RADAR / SCORECARD ADAPTER
  // Laplace-smoothed Defect Rate per Vendor vs 6.0% Freeze Threshold
  // ─────────────────────────────────────────────────────────────
  const defectData = useMemo(() => {
    if (activeEngineId !== 'defects' || !items.length) return [];
    return items.map((it) => {
      const q = it.quant_details || {};
      const rate = q.smoothed_defect_rate || 1.5;
      const status = q.status || 'EXCELLENT';
      const sold = it.baseline ? parseInt(it.baseline.replace(/[^\d]/g, ''), 10) : 1000;
      const defects = it.variance ? parseInt(it.variance.replace(/[^\d]/g, ''), 10) : 10;

      let sColor = '#10b981';
      if (status === 'ACCEPTABLE') sColor = '#38bdf8';
      if (status === 'ELEVATED_DEFECTS') sColor = '#f59e0b';
      if (status === 'CRITICAL_PO_FREEZE' || rate >= 6.0) sColor = '#ef4444';

      return {
        id: it.id,
        name: it.entity,
        rate: rate,
        status: status,
        sold: sold,
        defects: defects,
        statusColor: sColor,
        isSelected: it.id === selectedEntityId
      };
    });
  }, [activeEngineId, items, selectedEntityId]);

  // ─────────────────────────────────────────────────────────────
  // 6. KHATA WORKING CAPITAL GATE ADAPTER
  // Stacked Aging Buckets & DSO
  // ─────────────────────────────────────────────────────────────
  const khataData = useMemo(() => {
    if (activeEngineId !== 'khata' || !items.length) return [];
    return items.map((it) => {
      const q = it.quant_details || {};
      const dso = q.dso_days || 25;
      const limit = q.credit_limit || 50000;
      const balMatch = it.baseline ? parseInt(it.baseline.replace(/[^\d]/g, ''), 10) : 20000;
      const balance = Number.isFinite(balMatch) ? balMatch : 20000;
      const status = q.gate_status || 'CLEARED';

      // Synthesize non-overlapping aging tiers for stacked visual
      let c0_30 = 0, c31_45 = 0, c46_60 = 0, c61_plus = 0;
      if (dso <= 30) {
        c0_30 = balance;
      } else if (dso <= 45) {
        c0_30 = Math.round(balance * 0.4);
        c31_45 = Math.round(balance * 0.6);
      } else if (dso <= 60) {
        c0_30 = Math.round(balance * 0.2);
        c31_45 = Math.round(balance * 0.3);
        c46_60 = Math.round(balance * 0.5);
      } else {
        c0_30 = Math.round(balance * 0.1);
        c31_45 = Math.round(balance * 0.15);
        c46_60 = Math.round(balance * 0.25);
        c61_plus = Math.round(balance * 0.5);
      }

      let sColor = '#10b981';
      if (status === 'WARNING') sColor = '#f59e0b';
      if (status === 'BLOCKED') sColor = '#ef4444';

      return {
        id: it.id,
        name: it.entity,
        category: it.category,
        balance: balance,
        creditLimit: limit,
        dso: dso,
        status: status,
        statusColor: sColor,
        c0_30,
        c31_45,
        c46_60,
        c61_plus,
        isSelected: it.id === selectedEntityId
      };
    });
  }, [activeEngineId, items, selectedEntityId]);

  // ─────────────────────────────────────────────────────────────
  // 7. TPS ANDON CORD ADAPTER
  // Anomaly Variance Bar (Volume Var %, Cost Var %, Margin Drop %)
  // ─────────────────────────────────────────────────────────────
  const andonData = useMemo(() => {
    if (activeEngineId !== 'andon' || !items.length) return [];
    return items.map((it) => {
      const q = it.quant_details || {};
      const volVar = q.volume_var_pct != null ? q.volume_var_pct : 15;
      const costVar = q.cost_var_pct != null ? q.cost_var_pct : 2;
      const isTripped = q.andon_tripped || false;

      return {
        id: it.id,
        name: it.entity,
        volVar: volVar,
        costVar: costVar,
        isTripped: isTripped,
        isSelected: it.id === selectedEntityId
      };
    });
  }, [activeEngineId, items, selectedEntityId]);

  const chartHeight = isMobile ? 220 : 270;

  return (
    <div className="studio-visualizer-container" style={{ width: '100%', minHeight: chartHeight }}>
      {/* 1. DEMAND SCATTER / BUBBLE CHART */}
      {activeEngineId === 'demand' && (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="doir"
                name="Stock Cover (Days)"
                unit="d"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={[0, 'dataMax + 5']}
              />
              <YAxis
                type="number"
                dataKey="forecast"
                name="Forecast Units"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
              />
              <ZAxis type="number" dataKey="poQty" range={[60, 260]} name="PO Quantity" />
              <RechartsTooltip
                content={<StudioCustomTooltip engineId="demand" />}
                cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.2)' }}
              />
              <ReferenceLine x={5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Lead Time (5d)', fill: '#ef4444', fontSize: 10, position: 'top' }} />
              <Scatter
                name="Demand Replenishment"
                data={demandData}
                onClick={(node) => onSelectEntity(node.id)}
                style={{ cursor: 'pointer' }}
              >
                {demandData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke={entry.isSelected ? '#ffffff' : 'rgba(0,0,0,0.4)'}
                    strokeWidth={entry.isSelected ? 3 : 1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 2. CROSS-SELL ASSOCIATION MATRIX */}
      {activeEngineId === 'cross_sell' && (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="support"
                name="Support %"
                unit="%"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={[0, 'dataMax + 5']}
              />
              <YAxis
                type="number"
                dataKey="confidence"
                name="Confidence %"
                unit="%"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={[0, 100]}
              />
              <ZAxis type="number" dataKey="lift" range={[80, 280]} name="Lift Factor" />
              <RechartsTooltip
                content={<StudioCustomTooltip engineId="cross_sell" />}
                cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.2)' }}
              />
              <ReferenceLine y={50} stroke="#38bdf8" strokeDasharray="4 4" label={{ value: 'Target Conf (50%)', fill: '#38bdf8', fontSize: 10, position: 'insideTopLeft' }} />
              <Scatter
                name="Association Rules"
                data={crossSellData}
                onClick={(node) => onSelectEntity(node.id)}
                style={{ cursor: 'pointer' }}
              >
                {crossSellData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.lift >= 2.0 ? '#818cf8' : '#38bdf8'}
                    stroke={entry.isSelected ? '#ffffff' : 'rgba(0,0,0,0.4)'}
                    strokeWidth={entry.isSelected ? 3 : 1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 3. VILLAGE 5-TIER STRATEGIC QUADRANT */}
      {activeEngineId === 'village' && (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="rmi"
                name="Revenue Momentum (RMI %)"
                unit="%"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="students"
                name="Target Students"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
              />
              <ZAxis type="number" range={[100, 260]} />
              <RechartsTooltip
                content={<StudioCustomTooltip engineId="village" />}
                cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.2)' }}
              />
              {/* Quadrant Dividers */}
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} label={{ value: '0% Momentum', fill: '#94a3b8', fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine y={50} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} label={{ value: '50 Students', fill: '#94a3b8', fontSize: 10, position: 'insideBottomLeft' }} />
              <Scatter
                name="Village H3 Nodes"
                data={villageData}
                onClick={(node) => onSelectEntity(node.id)}
                style={{ cursor: 'pointer' }}
              >
                {villageData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.quadrantColor}
                    stroke={entry.isSelected ? '#ffffff' : 'rgba(0,0,0,0.5)'}
                    strokeWidth={entry.isSelected ? 3 : 1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 4. DYNAMIC PRICING ECONOMETRIC CURVE */}
      {activeEngineId === 'pricing' && (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pricingData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="price" stroke="#64748b" tick={{ fontSize: 11 }} unit="₹" />
              <YAxis yAxisId="left" stroke="#38bdf8" tick={{ fontSize: 11 }} unit="u" label={{ value: 'Volume', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 11 }} unit="%" label={{ value: 'Margin %', angle: 90, position: 'insideRight', fill: '#10b981', fontSize: 10 }} domain={[0, 50]} />
              <RechartsTooltip content={<StudioCustomTooltip engineId="pricing" />} />
              <Area yAxisId="left" type="monotone" dataKey="volume" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" strokeWidth={2} name="Projected Volume" />
              <Line yAxisId="right" type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Gross Margin %" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 5. QUALITY DEFECT RADAR / SCORECARD */}
      {activeEngineId === 'defects' && (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={defectData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="%" domain={[0, 'dataMax + 2']} />
              <RechartsTooltip content={<StudioCustomTooltip engineId="defects" />} />
              <ReferenceLine y={6.0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" label={{ value: '6.0% Freeze Limit', fill: '#ef4444', fontSize: 10, position: 'top' }} />
              <Bar dataKey="rate" name="Smoothed Defect %" radius={[4, 4, 0, 0]} onClick={(node) => onSelectEntity(node.id)} style={{ cursor: 'pointer' }}>
                {defectData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.statusColor}
                    stroke={entry.isSelected ? '#ffffff' : 'none'}
                    strokeWidth={entry.isSelected ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 6. KHATA STACKED AGING BUCKETS */}
      {activeEngineId === 'khata' && (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={khataData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <RechartsTooltip content={<StudioCustomTooltip engineId="khata" />} />
              <ReferenceLine y={50000} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Credit Limit ₹50k', fill: '#f59e0b', fontSize: 10, position: 'top' }} />
              <Bar dataKey="c0_30" stackId="a" fill="#10b981" name="0-30d Current" onClick={(node) => onSelectEntity(node.id)} style={{ cursor: 'pointer' }} />
              <Bar dataKey="c31_45" stackId="a" fill="#f59e0b" name="31-45d Watchlist" onClick={(node) => onSelectEntity(node.id)} style={{ cursor: 'pointer' }} />
              <Bar dataKey="c46_60" stackId="a" fill="#f97316" name="46-60d Delinquent" onClick={(node) => onSelectEntity(node.id)} style={{ cursor: 'pointer' }} />
              <Bar dataKey="c61_plus" stackId="a" fill="#ef4444" name="61+d Critical/Legacy" onClick={(node) => onSelectEntity(node.id)} style={{ cursor: 'pointer' }} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 7. TPS ANDON VARIANCE BAR */}
      {activeEngineId === 'andon' && (
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={andonData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="%" />
              <RechartsTooltip content={<StudioCustomTooltip engineId="andon" />} />
              <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '+30% Vol Limit', fill: '#ef4444', fontSize: 10 }} />
              <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '+15% Cost Limit', fill: '#f59e0b', fontSize: 10 }} />
              <Bar dataKey="volVar" name="Volume Var %" fill="#38bdf8" radius={[4, 4, 0, 0]} onClick={(node) => onSelectEntity(node.id)} style={{ cursor: 'pointer' }}>
                {andonData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={Math.abs(entry.volVar) > 30 ? '#ef4444' : '#38bdf8'}
                    stroke={entry.isSelected ? '#ffffff' : 'none'}
                    strokeWidth={entry.isSelected ? 2 : 0}
                  />
                ))}
              </Bar>
              <Bar dataKey="costVar" name="Cost Hike %" fill="#f59e0b" radius={[4, 4, 0, 0]} onClick={(node) => onSelectEntity(node.id)} style={{ cursor: 'pointer' }}>
                {andonData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.costVar > 15 ? '#ef4444' : '#f59e0b'}
                    stroke={entry.isSelected ? '#ffffff' : 'none'}
                    strokeWidth={entry.isSelected ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
