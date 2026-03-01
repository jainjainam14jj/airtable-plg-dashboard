// ============================================================
// Airtable PLG Intelligence Dashboard - app.js
// Full React application with calculation engine
// Uses UMD globals: React, ReactDOM, htm, Recharts
// ============================================================
(function() {
'use strict';

try {

var h = React.createElement;
var html = htm.bind(h);
var useState = React.useState;
var useMemo = React.useMemo;
var useCallback = React.useCallback;
var useEffect = React.useEffect;
var useRef = React.useRef;
var LineChart = Recharts.LineChart;
var Line = Recharts.Line;
var XAxis = Recharts.XAxis;
var YAxis = Recharts.YAxis;
var CartesianGrid = Recharts.CartesianGrid;
var Tooltip = Recharts.Tooltip;
var ResponsiveContainer = Recharts.ResponsiveContainer;
var BarChart = Recharts.BarChart;
var Bar = Recharts.Bar;
var PieChart = Recharts.PieChart;
var Pie = Recharts.Pie;
var Cell = Recharts.Cell;
var AreaChart = Recharts.AreaChart;
var Area = Recharts.Area;
var Legend = Recharts.Legend;
var ReferenceLine = Recharts.ReferenceLine;
var ComposedChart = Recharts.ComposedChart;

// ============================================================
// CONSTANTS & ASSUMPTIONS
// ============================================================
const CHART_COLORS = ['#2D7FF9', '#20C933', '#FCB400', '#8B46FF', '#FF6F2C', '#18BFFF'];

const DEFAULT_ASSUMPTIONS = {
  monthlyFreeSignups: 15000,
  freeToPaidConversionRate: 0.04,
  tierDist: { team: 0.70, business: 0.25, enterprise: 0.05 },
  avgStartingSeats: { team: 5, business: 12, enterprise: 50 },
  monthlySeatExpansion: { team: 0.03, business: 0.05, enterprise: 0.08 },
  annualUpgrade: { teamToBusiness: 0.10, businessToEnterprise: 0.05 },
  monthlyLogoChurn: { team: 0.03, business: 0.015, enterprise: 0.005 },
  pricePerSeat: { team: 20, business: 45, enterprise: 85 },
  aiCreditAdoptionRate: 0.30,
  aiRevenuePerActiveUser: 3.00,
  aiInferenceCostPerCredit: 0.002,
  baseGrossMargin: 0.92,
  aiGrossMargin: 0.65,
};

const SCENARIO_CONFIGS = {
  bear: {
    name: 'bear',
    description: 'AI Cannibalizes Margins, Growth Slows',
    assumptionsOverrides: {
      freeToPaidConversionRate: 0.03,
      monthlySeatExpansion: { team: 0.02, business: 0.03, enterprise: 0.05 },
      aiCreditAdoptionRate: 0.50,
      aiRevenuePerActiveUser: 1.50,
      aiInferenceCostPerCredit: 0.0026,
      baseGrossMargin: 0.78,
      aiGrossMargin: 0.45,
      monthlyLogoChurn: { team: 0.04, business: 0.02, enterprise: 0.008 },
    },
  },
  base: {
    name: 'base',
    description: 'Steady State, AI Adds Incremental Value',
    assumptionsOverrides: {
      baseGrossMargin: 0.85,
      aiGrossMargin: 0.65,
    },
  },
  bull: {
    name: 'bull',
    description: 'AI Becomes Primary Expansion Lever',
    assumptionsOverrides: {
      freeToPaidConversionRate: 0.055,
      monthlySeatExpansion: { team: 0.04, business: 0.07, enterprise: 0.10 },
      aiCreditAdoptionRate: 0.60,
      aiRevenuePerActiveUser: 5.00,
      aiInferenceCostPerCredit: 0.0018,
      baseGrossMargin: 0.88,
      aiGrossMargin: 0.72,
      monthlyLogoChurn: { team: 0.025, business: 0.012, enterprise: 0.003 },
    },
  },
};

const EXISTING_CUSTOMERS = 166000;
const STARTING_ARR = 478000000;
const STARTING_MRR = STARTING_ARR / 12;
const REPORTED_NRR = 170;

const VARIANCE_DATA = [
  { period: '2025-01-01', metric: 'total_mrr', plan: 40200000, actual: 41100000 },
  { period: '2025-01-01', metric: 'ai_mrr', plan: 850000, actual: 980000 },
  { period: '2025-02-01', metric: 'total_mrr', plan: 41100000, actual: 42380000 },
  { period: '2025-02-01', metric: 'ai_mrr', plan: 980000, actual: 1145000 },
  { period: '2025-02-01', metric: 'expansion_mrr', plan: 2800000, actual: 2650000 },
  { period: '2025-03-01', metric: 'total_mrr', plan: 42380000, actual: 43500000 },
  { period: '2025-03-01', metric: 'blended_gross_margin', plan: 0.85, actual: 0.848 },
];

// ============================================================
// FORMATTING HELPERS
// ============================================================
function fmtDollar(val) {
  if (val === undefined || val === null || isNaN(val)) return '$0';
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
}

function fmtPct(val, decimals) {
  decimals = decimals || 1;
  if (val === undefined || val === null || isNaN(val)) return '0%';
  return (val * 100).toFixed(decimals) + '%';
}

function fmtPctDisplay(val) {
  return val.toFixed(1) + '%';
}

function fmtNum(val) {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Math.round(val).toLocaleString('en-US');
}

// ============================================================
// CALCULATION ENGINE
// ============================================================
function mergeAssumptions(base, overrides) {
  if (!overrides) return Object.assign({}, base);
  var result = Object.assign({}, base);
  for (var key in overrides) {
    if (overrides[key] !== null && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
      result[key] = Object.assign({}, base[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

function generateCohort(input, assumptions, numMonths) {
  var signupMonth = input.signupMonth;
  var tier = input.tier;
  var startingCustomers = input.startingCustomers;
  var startingMRR = input.startingMRR;
  var avgSeats = input.avgSeats;
  var months = [];

  var customers = startingCustomers;
  var seats = avgSeats;
  var baseMRR = startingMRR;

  var aiUsers0 = Math.round(customers * assumptions.aiCreditAdoptionRate);
  var aiMRR0 = aiUsers0 * assumptions.aiRevenuePerActiveUser;

  months.push({
    month: 0, date: new Date(signupMonth), customersRetained: customers,
    seats: seats, baseMRR: baseMRR, aiMRR: aiMRR0,
    totalMRR: baseMRR + aiMRR0, expansionMRR: 0,
    contractionMRR: 0, churnedMRR: 0, retentionRate: 1.0,
  });

  for (var m = 1; m <= numMonths; m++) {
    var prevCustomers = customers;
    var prevBaseMRR = baseMRR;
    var churnedCustomers = Math.round(customers * assumptions.monthlyLogoChurn[tier]);
    customers = customers - churnedCustomers;
    var churnedMRR = churnedCustomers > 0 ? (churnedCustomers / prevCustomers) * prevBaseMRR : 0;

    var seatExpRate = assumptions.monthlySeatExpansion[tier];
    var prevSeats = seats;
    seats = seats * (1 + seatExpRate);
    var expansionMRR = customers * (seats - prevSeats) * assumptions.pricePerSeat[tier];

    baseMRR = customers * seats * assumptions.pricePerSeat[tier];
    var contractionMRR = churnedMRR;

    var aiUsers = Math.round(customers * assumptions.aiCreditAdoptionRate);
    var aiMRR = aiUsers * assumptions.aiRevenuePerActiveUser;
    var retentionRate = startingCustomers > 0 ? customers / startingCustomers : 0;

    var d = new Date(signupMonth.getTime());
    d.setMonth(d.getMonth() + m);

    months.push({
      month: m, date: d, customersRetained: customers,
      seats: seats, baseMRR: baseMRR, aiMRR: aiMRR,
      totalMRR: baseMRR + aiMRR, expansionMRR: expansionMRR,
      contractionMRR: contractionMRR, churnedMRR: churnedMRR,
      retentionRate: retentionRate,
    });
  }

  return { tier: tier, signupMonth: signupMonth, months: months };
}

function calculateBlendedNRR(cohorts) {
  var totalStart = 0, totalEnd = 0;
  for (var i = 0; i < cohorts.length; i++) {
    var c = cohorts[i];
    if (c.months.length >= 2) {
      totalStart += c.months[0].baseMRR;
      totalEnd += c.months[c.months.length - 1].baseMRR;
    }
  }
  return totalStart > 0 ? totalEnd / totalStart : 1.0;
}

function calculateBlendedGRR(cohorts) {
  var totalStart = 0, totalGross = 0;
  for (var i = 0; i < cohorts.length; i++) {
    var c = cohorts[i];
    if (c.months.length >= 2) {
      var start = c.months[0].baseMRR;
      var last = c.months[c.months.length - 1];
      totalStart += start;
      totalGross += Math.max(0, start - last.churnedMRR * c.months.length);
    }
  }
  return totalStart > 0 ? Math.min(totalGross / totalStart, 1.0) : 1.0;
}

function buildFunnelStages(assumptions) {
  var signups = assumptions.monthlyFreeSignups;
  var activated = Math.round(signups * 0.55);
  var habitFormed = Math.round(activated * 0.45);
  var featureGateHit = Math.round(habitFormed * 0.60);
  var paidConvert = Math.round(signups * assumptions.freeToPaidConversionRate);
  return [
    { name: 'Free Signups', value: signups, pct: 1.0 },
    { name: 'Activated (7-day)', value: activated, pct: activated / signups },
    { name: 'Habit Formed', value: habitFormed, pct: habitFormed / signups },
    { name: 'Feature Gate Hit', value: featureGateHit, pct: featureGateHit / signups },
    { name: 'Paid Convert', value: paidConvert, pct: paidConvert / signups },
  ];
}

function calculateNewMRR(assumptions) {
  var newPaid = Math.round(assumptions.monthlyFreeSignups * assumptions.freeToPaidConversionRate);
  var tiers = ['team', 'business', 'enterprise'];
  var total = 0;
  for (var i = 0; i < tiers.length; i++) {
    var t = tiers[i];
    var cnt = Math.round(newPaid * assumptions.tierDist[t]);
    total += cnt * assumptions.avgStartingSeats[t] * assumptions.pricePerSeat[t];
  }
  return total;
}

function calculateBlendedMargin(nonAiRev, aiRev, baseMargin, aiMargin) {
  var totalRev = nonAiRev + aiRev;
  if (totalRev === 0) return baseMargin;
  return (nonAiRev * baseMargin + aiRev * aiMargin) / totalRev;
}

// ============================================================
// SCENARIO PROJECTOR (with legacy cohort fix)
// ============================================================
function projectScenario(baseAssumptions, overrides, numMonths, startingMRR) {
  var assumptions = mergeAssumptions(baseAssumptions, overrides);
  var tiers = ['team', 'business', 'enterprise'];

  // Legacy cohorts for existing 166K customers
  var legacyDate = new Date('2024-12-01');
  var legacyCohorts = [];

  for (var ti = 0; ti < tiers.length; ti++) {
    var tier = tiers[ti];
    var custCount = Math.round(EXISTING_CUSTOMERS * assumptions.tierDist[tier]);
    var legacyMRR = custCount * assumptions.avgStartingSeats[tier] * assumptions.pricePerSeat[tier];
    legacyCohorts.push(
      generateCohort({
        signupMonth: new Date(legacyDate.getTime()),
        tier: tier,
        startingCustomers: custCount,
        startingMRR: legacyMRR,
        avgSeats: assumptions.avgStartingSeats[tier],
      }, assumptions, numMonths + 1)
    );
  }

  // New monthly cohorts
  var newCohorts = [];
  var monthlyResults = [];

  for (var m = 1; m <= numMonths; m++) {
    var cohortDate = new Date('2025-01-01');
    cohortDate.setMonth(cohortDate.getMonth() + m - 1);
    var newPaid = Math.round(assumptions.monthlyFreeSignups * assumptions.freeToPaidConversionRate);

    for (var ti2 = 0; ti2 < tiers.length; ti2++) {
      var t = tiers[ti2];
      var cnt = Math.round(newPaid * assumptions.tierDist[t]);
      var tierMRR = cnt * assumptions.avgStartingSeats[t] * assumptions.pricePerSeat[t];
      var cohort = generateCohort({
        signupMonth: new Date(cohortDate.getTime()),
        tier: t,
        startingCustomers: cnt,
        startingMRR: tierMRR,
        avgSeats: assumptions.avgStartingSeats[t],
      }, assumptions, numMonths - m + 1);
      newCohorts.push(cohort);
    }

    // Sum across all new cohorts for this month
    var totalBaseMRR = 0, totalAIMRR = 0, totalCustomers = 0;
    var totalExpansionMRR = 0, totalContractionMRR = 0, totalChurnedMRR = 0;

    for (var ci = 0; ci < newCohorts.length; ci++) {
      var nc = newCohorts[ci];
      // Calculate age of this cohort relative to month m
      var startBase = new Date('2025-01-01');
      var cohortMonthIdx = Math.round((nc.signupMonth.getTime() - startBase.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
      var age = (m - 1) - cohortMonthIdx;
      if (age >= 0 && age < nc.months.length) {
        var snap = nc.months[age];
        totalBaseMRR += snap.baseMRR;
        totalAIMRR += snap.aiMRR;
        totalCustomers += snap.customersRetained;
        totalExpansionMRR += snap.expansionMRR;
        totalContractionMRR += snap.contractionMRR;
        totalChurnedMRR += snap.churnedMRR;
      }
    }

    // Add legacy cohorts
    for (var li = 0; li < legacyCohorts.length; li++) {
      var lc = legacyCohorts[li];
      if (lc.months[m]) {
        var ls = lc.months[m];
        totalBaseMRR += ls.baseMRR;
        totalAIMRR += ls.aiMRR;
        totalCustomers += ls.customersRetained;
        totalExpansionMRR += ls.expansionMRR;
        totalContractionMRR += ls.contractionMRR;
        totalChurnedMRR += ls.churnedMRR;
      }
    }

    var closingMRR = totalBaseMRR + totalAIMRR;
    var blendedGrossMargin = calculateBlendedMargin(totalBaseMRR, totalAIMRR, assumptions.baseGrossMargin, assumptions.aiGrossMargin);
    var aiMixPct = closingMRR > 0 ? totalAIMRR / closingMRR : 0;

    monthlyResults.push({
      month: m, label: 'M' + m, closingMRR: closingMRR,
      baseMRR: totalBaseMRR, aiMRR: totalAIMRR,
      totalCustomers: totalCustomers,
      expansionMRR: totalExpansionMRR, contractionMRR: totalContractionMRR,
      churnedMRR: totalChurnedMRR, newMRR: calculateNewMRR(assumptions),
      blendedGrossMargin: blendedGrossMargin, aiMixPct: aiMixPct,
      closingARR: closingMRR * 12,
    });
  }

  return { assumptions: assumptions, monthlyResults: monthlyResults, legacyCohorts: legacyCohorts, newCohorts: newCohorts };
}

function runScenario(scenarioName, baseAssumptions, numMonths, startMRR) {
  var config = SCENARIO_CONFIGS[scenarioName];
  return projectScenario(baseAssumptions, config.assumptionsOverrides, numMonths, startMRR);
}

function calculateVariance(planValue, actualValue, metricName, period) {
  var abs = actualValue - planValue;
  var pct = planValue !== 0 ? abs / planValue : 0;
  var isMargin = metricName.indexOf('margin') >= 0;
  var status;
  if (isMargin) {
    var diff = actualValue - planValue;
    if (diff >= 0) status = 'favorable';
    else if (diff >= -0.005) status = 'watch';
    else status = 'unfavorable';
  } else {
    if (pct >= 0.01) status = 'favorable';
    else if (pct >= -0.02) status = 'watch';
    else status = 'unfavorable';
  }
  return { period: period, metric: metricName, plan: planValue, actual: actualValue, variance: abs, variancePct: pct, status: status };
}

function processVarianceData(data) {
  return data.map(function(d) { return calculateVariance(d.plan, d.actual, d.metric, d.period); });
}

// ============================================================
// HELPER: get total MRR by tier from projection
// ============================================================
function getTotalMRRByTier(projection, month) {
  var tiers = { team: 0, business: 0, enterprise: 0 };
  for (var i = 0; i < projection.legacyCohorts.length; i++) {
    var lc = projection.legacyCohorts[i];
    if (lc.months[month]) {
      tiers[lc.tier] += lc.months[month].baseMRR;
    }
  }
  var startBase = new Date('2025-01-01');
  for (var j = 0; j < projection.newCohorts.length; j++) {
    var nc = projection.newCohorts[j];
    var cohortMonthIdx = Math.round((nc.signupMonth.getTime() - startBase.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
    var age = (month - 1) - cohortMonthIdx;
    if (age >= 0 && age < nc.months.length) {
      tiers[nc.tier] += nc.months[age].baseMRR;
    }
  }
  return tiers;
}

// ============================================================
// SVG Icons (inline since we can't use Lucide reliably)
// ============================================================
function SvgIcon(props) {
  var icons = {
    'layout-dashboard': html`<svg width=${props.size||18} height=${props.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
    'users': html`<svg width=${props.size||18} height=${props.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    'sliders-horizontal': html`<svg width=${props.size||18} height=${props.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>`,
    'git-branch': html`<svg width=${props.size||18} height=${props.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
    'bar-chart-3': html`<svg width=${props.size||18} height=${props.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
    'sparkles': html`<svg width=${props.size||18} height=${props.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
    'info': html`<svg width=${props.size||18} height=${props.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  };
  return icons[props.name] || null;
}

// ============================================================
// NAV CONFIG
// ============================================================
var NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'cohorts', label: 'Cohort Analysis', icon: 'users' },
  { id: 'simulator', label: 'Expansion Simulator', icon: 'sliders-horizontal' },
  { id: 'scenarios', label: 'Scenario Planner', icon: 'git-branch' },
  { id: 'variance', label: 'Variance Analysis', icon: 'bar-chart-3' },
  { id: 'narratives', label: 'AI Narratives', icon: 'sparkles' },
];

// ============================================================
// SIDEBAR
// ============================================================
function Sidebar(props) {
  var page = props.page, navigate = props.navigate, onAbout = props.onAbout;
  return html`
    <aside className="sidebar">
      <div className="sidebar-brand">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="6" fill="#2D7FF9"/>
          <rect x="6" y="6" width="7" height="7" rx="1.5" fill="white" opacity="0.9"/>
          <rect x="15" y="6" width="7" height="7" rx="1.5" fill="white" opacity="0.7"/>
          <rect x="6" y="15" width="7" height="7" rx="1.5" fill="white" opacity="0.7"/>
          <rect x="15" y="15" width="7" height="7" rx="1.5" fill="white" opacity="0.5"/>
        </svg>
        <div>
          <div className="sidebar-brand-name">PLG Intelligence</div>
          <div className="sidebar-brand-sub">Analytics</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        ${NAV_ITEMS.map(function(item) {
          return html`
            <button key=${item.id}
              className=${'sidebar-nav-item' + (page === item.id ? ' active' : '')}
              onClick=${function() { navigate(item.id); }}>
              <${SvgIcon} name=${item.icon} size=${18} />
              ${item.label}
            </button>
          `;
        })}
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-nav-item" onClick=${onAbout}>
          <${SvgIcon} name="info" size=${18} />
          About
        </button>
      </div>
    </aside>
  `;
}

// ============================================================
// HEADER
// ============================================================
function Header(props) {
  var page = props.page;
  var found = NAV_ITEMS.find(function(n) { return n.id === page; });
  var title = found ? found.label : 'Overview';
  return html`
    <header className="header">
      <div className="header-left">
        <div className="header-company">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#2D7FF9"/>
            <rect x="11" y="1" width="8" height="8" rx="1.5" fill="#2D7FF9" opacity="0.6"/>
            <rect x="1" y="11" width="8" height="8" rx="1.5" fill="#2D7FF9" opacity="0.6"/>
            <rect x="11" y="11" width="8" height="8" rx="1.5" fill="#2D7FF9" opacity="0.3"/>
          </svg>
          <span className="header-company-name">Airtable</span>
        </div>
        <span style=${{ color: '#D1D5DB', fontSize: '20px', fontWeight: 300 }}>|</span>
        <span className="header-title">${title}</span>
      </div>
      <div className="header-right">
        <span className="header-badge">
          <span className="header-badge-dot"></span>
          Live Model
        </span>
      </div>
    </header>
  `;
}

// ============================================================
// CUSTOM TOOLTIP
// ============================================================
function CustomTooltip(props) {
  if (!props.active || !props.payload || !props.payload.length) return null;
  var formatter = props.formatter || fmtDollar;
  return html`
    <div className="custom-tooltip">
      <div className="custom-tooltip-label">${props.label}</div>
      ${props.payload.map(function(p, i) {
        return html`
          <div key=${i} className="custom-tooltip-row">
            <span className="custom-tooltip-dot" style=${{ background: p.color || p.stroke || p.fill }} />
            <span style=${{ color: '#6B7280' }}>${p.name || p.dataKey}:</span>
            <span style=${{ fontWeight: 600 }}>${formatter(p.value)}</span>
          </div>
        `;
      })}
    </div>
  `;
}

// ============================================================
// PAGE 1: OVERVIEW
// ============================================================
function OverviewPage(props) {
  var projection = props.projection;
  var bridgeMonthState = useState(1);
  var bridgeMonth = bridgeMonthState[0], setBridgeMonth = bridgeMonthState[1];
  var results = projection.monthlyResults;
  var m12 = results[11];
  var mSelected = results[bridgeMonth - 1];
  var m1 = results[0];

  var endingARR = m12.closingARR;
  var arrGrowth = (endingARR - STARTING_ARR) / STARTING_ARR;
  var grossMargin = m1.blendedGrossMargin;
  var aiMix = m1.aiMixPct;
  var endingCustomers = m12.totalCustomers;
  var customerDelta = endingCustomers - EXISTING_CUSTOMERS;

  var funnelStages = buildFunnelStages(DEFAULT_ASSUMPTIONS);
  var newMRR = calculateNewMRR(DEFAULT_ASSUMPTIONS);

  // Waterfall bridge
  var prevMRR = bridgeMonth === 1 ? STARTING_MRR : results[bridgeMonth - 2].closingMRR;
  var waterfallItems = [
    { name: 'Opening', value: prevMRR, fill: '#2D7FF9', isTotal: true },
    { name: 'New Logo', value: mSelected.newMRR, fill: '#20C933', isTotal: false },
    { name: 'Expansion', value: mSelected.expansionMRR, fill: '#20C933', isTotal: false },
    { name: 'AI Revenue', value: mSelected.aiMRR * 0.1, fill: '#8B46FF', isTotal: false },
    { name: 'Contraction', value: -mSelected.contractionMRR * 0.3, fill: '#F82B60', isTotal: false },
    { name: 'Churn', value: -mSelected.churnedMRR, fill: '#F82B60', isTotal: false },
    { name: 'Closing', value: mSelected.closingMRR, fill: '#2D7FF9', isTotal: true },
  ];

  var runTotal = 0;
  var waterfallData = waterfallItems.map(function(d) {
    if (d.isTotal) {
      runTotal = d.value;
      return { name: d.name, value: d.value, fill: d.fill, base: 0, display: d.value };
    }
    var base = runTotal;
    runTotal += d.value;
    return { name: d.name, value: d.value, fill: d.fill, base: Math.min(base, runTotal), display: Math.abs(d.value) };
  });

  // MRR trend
  var mrrTrend = results.map(function(r) {
    return { month: r.label, baseMRR: r.baseMRR, aiMRR: r.aiMRR };
  });

  // Revenue split donut
  var tierMRR = getTotalMRRByTier(projection, 1);
  var donutData = [
    { name: 'Team', value: tierMRR.team, fill: '#2D7FF9' },
    { name: 'Business', value: tierMRR.business, fill: '#20C933' },
    { name: 'Enterprise', value: tierMRR.enterprise, fill: '#FCB400' },
    { name: 'AI', value: m1.aiMRR, fill: '#8B46FF' },
  ];
  var donutTotal = donutData.reduce(function(s, d) { return s + d.value; }, 0);

  var funnelColors = ['#18BFFF', '#2D7FF9', '#2D7FF9', '#8B46FF', '#20C933'];

  return html`
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">ARR</div>
          <div className="kpi-value">$478M</div>
          <div className="kpi-sub">\u2192 ${fmtDollar(endingARR)} projected (12mo) <span className="positive">+${fmtPctDisplay(arrGrowth * 100)}</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Net Revenue Retention</div>
          <div className="kpi-value">${REPORTED_NRR}%</div>
          <div className="kpi-sub">Company-reported (2024)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Paying Companies</div>
          <div className="kpi-value">${fmtNum(EXISTING_CUSTOMERS)}</div>
          <div className="kpi-sub">\u2192 ${fmtNum(endingCustomers)} projected <span className=${customerDelta >= 0 ? 'positive' : 'negative'}>${customerDelta >= 0 ? '+' : ''}${fmtNum(customerDelta)}</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Gross Margin</div>
          <div className="kpi-value">${fmtPctDisplay(grossMargin * 100)}</div>
          <div className="kpi-sub">AI mix: ${fmtPctDisplay(aiMix * 100)}</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">ARR Bridge</div>
              <div className="card-subtitle">Waterfall decomposition</div>
            </div>
            <select value=${bridgeMonth} onChange=${function(e) { setBridgeMonth(Number(e.target.value)); }}>
              ${Array.from({length: 12}, function(_, i) {
                return html`<option key=${i+1} value=${i+1}>Month ${i+1}</option>`;
              })}
            </select>
          </div>
          <${ResponsiveContainer} width="100%" height=${280}>
            <${BarChart} data=${waterfallData} barCategoryGap="20%">
              <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
              <${XAxis} dataKey="name" tick=${{ fontSize: 11 }} />
              <${YAxis} tickFormatter=${fmtDollar} tick=${{ fontSize: 11 }} />
              <${Tooltip} content=${function(p) { return html`<${CustomTooltip} ...${p} />`; }} />
              <${Bar} dataKey="base" stackId="a" fill="transparent" />
              <${Bar} dataKey="display" stackId="a" radius=${[3,3,0,0]}>
                ${waterfallData.map(function(d, i) { return html`<${Cell} key=${i} fill=${d.fill} />`; })}
              </${Bar}>
            </${BarChart}>
          </${ResponsiveContainer}>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Monthly MRR Trend</div>
              <div className="card-subtitle">Base + AI revenue</div>
            </div>
          </div>
          <${ResponsiveContainer} width="100%" height=${280}>
            <${AreaChart} data=${mrrTrend}>
              <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
              <${XAxis} dataKey="month" tick=${{ fontSize: 11 }} />
              <${YAxis} tickFormatter=${fmtDollar} tick=${{ fontSize: 11 }} />
              <${Tooltip} content=${function(p) { return html`<${CustomTooltip} ...${p} />`; }} />
              <${Area} type="monotone" dataKey="baseMRR" stackId="1" stroke="#2D7FF9" fill="#2D7FF9" fillOpacity=${0.15} name="Base MRR" />
              <${Area} type="monotone" dataKey="aiMRR" stackId="1" stroke="#8B46FF" fill="#8B46FF" fillOpacity=${0.3} name="AI MRR" />
              <${Legend} />
            </${AreaChart}>
          </${ResponsiveContainer}>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">PLG Funnel</div>
              <div className="card-subtitle">Monthly conversion pipeline</div>
            </div>
          </div>
          <div style=${{ padding: '8px 0' }}>
            ${funnelStages.map(function(stage, i) {
              var maxVal = funnelStages[0].value;
              var width = Math.max((stage.value / maxVal) * 100, 8);
              return html`
                <div key=${i} style=${{ display: 'flex', alignItems: 'center', marginBottom: '10px', gap: '12px' }}>
                  <div style=${{ minWidth: '120px', fontSize: '12.5px', color: '#6B7280', textAlign: 'right' }}>${stage.name}</div>
                  <div style=${{ flex: 1, position: 'relative' }}>
                    <div style=${{
                      width: width + '%',
                      height: '32px',
                      background: funnelColors[i],
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: '10px',
                      transition: 'width 0.5s ease',
                    }}>
                      <span style=${{ color: 'white', fontSize: '12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        ${fmtNum(stage.value)}
                      </span>
                    </div>
                  </div>
                  <div style=${{ minWidth: '45px', fontSize: '12px', fontWeight: 600, color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
                    ${i === 0 ? '100%' : fmtPctDisplay(stage.pct * 100)}
                  </div>
                </div>
              `;
            })}
            <div style=${{ textAlign: 'right', fontSize: '12px', color: '#6B7280', marginTop: '8px' }}>
              New MRR: <strong style=${{ color: '#1F2937' }}>${fmtDollar(newMRR)}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Revenue Split by Tier</div>
              <div className="card-subtitle">Total MRR \u2014 Month 1</div>
            </div>
          </div>
          <${ResponsiveContainer} width="100%" height=${280}>
            <${PieChart}>
              <${Pie}
                data=${donutData}
                cx="50%" cy="50%"
                innerRadius=${70} outerRadius=${110}
                paddingAngle=${2}
                dataKey="value"
              >
                ${donutData.map(function(d, i) { return html`<${Cell} key=${i} fill=${d.fill} />`; })}
              </${Pie}>
              <${Tooltip} formatter=${fmtDollar} />
              <${Legend} />
            </${PieChart}>
          </${ResponsiveContainer}>
          <div style=${{ textAlign: 'center', fontSize: '13px', color: '#6B7280', marginTop: '-8px' }}>
            Total: <strong style=${{ color: '#1F2937' }}>${fmtDollar(donutTotal)}</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE 2: COHORT ANALYSIS
// ============================================================
function CohortPage() {
  var cohorts = useMemo(function() {
    var result = [];
    var tiers = ['team', 'business', 'enterprise'];
    for (var i = 0; i < 6; i++) {
      var date = new Date(Date.UTC(2025, i, 1));
      var monthCohorts = [];
      var newPaid = Math.round(DEFAULT_ASSUMPTIONS.monthlyFreeSignups * DEFAULT_ASSUMPTIONS.freeToPaidConversionRate);
      for (var ti = 0; ti < tiers.length; ti++) {
        var tier = tiers[ti];
        var custCount = Math.round(newPaid * DEFAULT_ASSUMPTIONS.tierDist[tier]);
        var mrr = custCount * DEFAULT_ASSUMPTIONS.avgStartingSeats[tier] * DEFAULT_ASSUMPTIONS.pricePerSeat[tier];
        monthCohorts.push(generateCohort({
          signupMonth: new Date(date.getTime()),
          tier: tier,
          startingCustomers: custCount,
          startingMRR: mrr,
          avgSeats: DEFAULT_ASSUMPTIONS.avgStartingSeats[tier],
        }, DEFAULT_ASSUMPTIONS, 12));
      }
      result.push({ date: date, label: date.toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' }), tiers: monthCohorts });
    }
    return result;
  }, []);

  var heatmapData = useMemo(function() {
    return cohorts.map(function(c, ci) {
      var maxMonths = 12 - ci;
      var retentions = [];
      for (var m = 0; m <= Math.min(maxMonths, 12); m++) {
        var totalCust0 = 0, totalCustM = 0;
        for (var ti = 0; ti < c.tiers.length; ti++) {
          totalCust0 += c.tiers[ti].months[0] ? c.tiers[ti].months[0].customersRetained : 0;
          totalCustM += c.tiers[ti].months[m] ? c.tiers[ti].months[m].customersRetained : 0;
        }
        retentions.push(totalCust0 > 0 ? totalCustM / totalCust0 : 0);
      }
      return { label: c.label, retentions: retentions, maxMonths: maxMonths };
    });
  }, [cohorts]);

  var allCohortData = [];
  cohorts.forEach(function(c) { c.tiers.forEach(function(t) { allCohortData.push(t); }); });
  var portfolioNRR = calculateBlendedNRR(allCohortData);
  var portfolioGRR = calculateBlendedGRR(allCohortData);

  var survivalData = useMemo(function() {
    var months = [];
    for (var i = 0; i <= 12; i++) months.push(i);
    return months.map(function(m) {
      var tierRet = {};
      var tierNames = ['team', 'business', 'enterprise'];
      for (var ti = 0; ti < tierNames.length; ti++) {
        var tier = tierNames[ti];
        var totalStart = 0, totalRetained = 0;
        for (var ci = 0; ci < cohorts.length; ci++) {
          for (var cti = 0; cti < cohorts[ci].tiers.length; cti++) {
            var tc = cohorts[ci].tiers[cti];
            if (tc.tier === tier && tc.months[m]) {
              totalStart += tc.months[0].customersRetained;
              totalRetained += tc.months[m].customersRetained;
            }
          }
        }
        tierRet[tier] = totalStart > 0 ? (totalRetained / totalStart) * 100 : 0;
      }
      return Object.assign({ month: 'M' + m }, tierRet);
    });
  }, [cohorts]);

  function getHeatmapColor(val) {
    if (val >= 0.8) return 'rgba(32, 201, 51, ' + (0.4 + val * 0.5) + ')';
    if (val >= 0.5) return 'rgba(252, 180, 0, ' + (0.5 + (val - 0.5) * 0.8) + ')';
    return 'rgba(248, 43, 96, ' + (0.3 + (0.5 - val) * 0.8) + ')';
  }

  return html`
    <div>
      <div className="grid-3 mb-24">
        <div className="kpi-card">
          <div className="kpi-label">Portfolio NRR</div>
          <div className="kpi-value">${fmtPctDisplay(portfolioNRR * 100)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Portfolio GRR</div>
          <div className="kpi-value">${fmtPctDisplay(portfolioGRR * 100)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg Months to Expand</div>
          <div className="kpi-value">1</div>
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <div className="card-title">Cohort Retention Heatmap</div>
            <div className="card-subtitle">Logo retention by signup month</div>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="heatmap-table">
            <thead>
              <tr>
                <th style=${{ textAlign: 'left' }}>Cohort</th>
                ${Array.from({ length: 13 }, function(_, i) { return html`<th key=${i}>M${i}</th>`; })}
              </tr>
            </thead>
            <tbody>
              ${heatmapData.map(function(row, ri) {
                return html`
                  <tr key=${ri}>
                    <td className="cohort-label">${row.label}</td>
                    ${Array.from({ length: 13 }, function(_, mi) {
                      if (mi > row.maxMonths) {
                        return html`<td key=${mi}><span className="heatmap-empty">\u00A0</span></td>`;
                      }
                      var val = row.retentions[mi] || 0;
                      var bg = getHeatmapColor(val);
                      var textColor = val > 0.6 ? 'white' : '#1F2937';
                      return html`<td key=${mi}><span className="heatmap-cell" style=${{ background: bg, color: textColor }}>${(val * 100).toFixed(0)}%</span></td>`;
                    })}
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Survival Curves by Tier</div>
            <div className="card-subtitle">% customers retained over time</div>
          </div>
        </div>
        <${ResponsiveContainer} width="100%" height=${300}>
          <${LineChart} data=${survivalData}>
            <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
            <${XAxis} dataKey="month" tick=${{ fontSize: 11 }} />
            <${YAxis} domain=${[0, 100]} tickFormatter=${function(v) { return v + '%'; }} tick=${{ fontSize: 11 }} />
            <${Tooltip} formatter=${function(v) { return v.toFixed(1) + '%'; }} />
            <${Legend} />
            <${Line} type="monotone" dataKey="team" stroke="#2D7FF9" strokeWidth=${2} name="Team" dot=${false} />
            <${Line} type="monotone" dataKey="business" stroke="#20C933" strokeWidth=${2} name="Business" dot=${false} />
            <${Line} type="monotone" dataKey="enterprise" stroke="#8B46FF" strokeWidth=${2} name="Enterprise" dot=${false} />
          </${LineChart}>
        </${ResponsiveContainer}>
      </div>
    </div>
  `;
}

// ============================================================
// SLIDER ROW COMPONENT
// ============================================================
function SliderRow(props) {
  return html`
    <div className="slider-row">
      <span className="slider-label">${props.label}</span>
      <input type="range" className="slider-input" value=${props.value} min=${props.min} max=${props.max} step=${props.step}
        onInput=${function(e) { props.onChange(parseFloat(e.target.value)); }} />
      <span className="slider-value">${props.format(props.value)}</span>
    </div>
  `;
}

// ============================================================
// PAGE 3: EXPANSION SIMULATOR
// ============================================================
function SimulatorPage() {
  var paramsState = useState(function() { return JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)); });
  var params = paramsState[0], setParams = paramsState[1];

  function updateParam(key, val) {
    setParams(function(p) { var n = Object.assign({}, p); n[key] = val; return n; });
  }

  function updateNested(key, subkey, val) {
    setParams(function(p) {
      var n = Object.assign({}, p);
      n[key] = Object.assign({}, p[key]);
      n[key][subkey] = val;
      return n;
    });
  }

  function updateTierDist(tier, val) {
    setParams(function(p) {
      var newDist = Object.assign({}, p.tierDist);
      var oldVal = newDist[tier];
      newDist[tier] = val;
      var diff = val - oldVal;
      var otherTiers = ['team', 'business', 'enterprise'].filter(function(t) { return t !== tier; });
      var otherTotal = otherTiers.reduce(function(s, t) { return s + newDist[t]; }, 0);
      if (otherTotal > 0) {
        for (var i = 0; i < otherTiers.length; i++) {
          newDist[otherTiers[i]] = Math.max(0, newDist[otherTiers[i]] - diff * (newDist[otherTiers[i]] / otherTotal));
        }
      }
      var total = newDist.team + newDist.business + newDist.enterprise;
      if (Math.abs(total - 1) > 0.001) {
        newDist.team /= total; newDist.business /= total; newDist.enterprise /= total;
      }
      var n = Object.assign({}, p); n.tierDist = newDist; return n;
    });
  }

  function resetDefaults() {
    setParams(JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)));
  }

  var simProjection = useMemo(function() {
    return projectScenario(DEFAULT_ASSUMPTIONS, params, 12, STARTING_MRR);
  }, [params]);

  var defaultProjection = useMemo(function() {
    return projectScenario(DEFAULT_ASSUMPTIONS, null, 12, STARTING_MRR);
  }, []);

  var simResults = simProjection.monthlyResults;
  var defResults = defaultProjection.monthlyResults;
  var simM12 = simResults[11];
  var defM12 = defResults[11];

  var endingARR = simM12.closingARR;
  var defaultARR = defM12.closingARR;
  var arrDelta = endingARR - defaultARR;
  var endingMRR = simM12.closingMRR;
  var defaultMRR = defM12.closingMRR;
  var mrrDelta = endingMRR - defaultMRR;
  var endingCust = simM12.totalCustomers;
  var defaultCust = defM12.totalCustomers;
  var custDelta = endingCust - defaultCust;

  var netNewMRRData = simResults.map(function(r, i) {
    return {
      month: r.label,
      simulated: r.closingMRR - (i > 0 ? simResults[i - 1].closingMRR : STARTING_MRR),
      'default': defResults[i].closingMRR - (i > 0 ? defResults[i - 1].closingMRR : STARTING_MRR),
    };
  });

  var marginData = simResults.map(function(r, i) {
    return { month: r.label, simulated: r.blendedGrossMargin * 100, 'default': defResults[i].blendedGrossMargin * 100 };
  });

  var customerData = simResults.map(function(r, i) {
    return { month: r.label, simulated: r.totalCustomers, 'default': defResults[i].totalCustomers };
  });

  return html`
    <div className="sim-layout">
      <div className="sim-controls card">
        <div className="card-header">
          <div className="card-title">Assumptions</div>
          <button className="btn btn-sm" onClick=${resetDefaults}>Reset Defaults</button>
        </div>

        <div className="slider-group">
          <div className="slider-group-title">Conversion</div>
          <${SliderRow} label="Free Signups" value=${params.monthlyFreeSignups} min=${5000} max=${50000} step=${1000} onChange=${function(v) { updateParam('monthlyFreeSignups', v); }} format=${fmtNum} />
          <${SliderRow} label="Conversion Rate" value=${params.freeToPaidConversionRate} min=${0.01} max=${0.12} step=${0.005} onChange=${function(v) { updateParam('freeToPaidConversionRate', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Team %" value=${params.tierDist.team} min=${0} max=${1} step=${0.05} onChange=${function(v) { updateTierDist('team', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Business %" value=${params.tierDist.business} min=${0} max=${1} step=${0.05} onChange=${function(v) { updateTierDist('business', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Enterprise %" value=${params.tierDist.enterprise} min=${0} max=${1} step=${0.05} onChange=${function(v) { updateTierDist('enterprise', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
        </div>

        <div className="slider-group">
          <div className="slider-group-title">Expansion</div>
          <${SliderRow} label="Team Seat Exp" value=${params.monthlySeatExpansion.team} min=${0} max=${0.10} step=${0.005} onChange=${function(v) { updateNested('monthlySeatExpansion', 'team', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Business Seat Exp" value=${params.monthlySeatExpansion.business} min=${0} max=${0.15} step=${0.005} onChange=${function(v) { updateNested('monthlySeatExpansion', 'business', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Enterprise Seat Exp" value=${params.monthlySeatExpansion.enterprise} min=${0} max=${0.20} step=${0.005} onChange=${function(v) { updateNested('monthlySeatExpansion', 'enterprise', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Team\u2192Biz Upgrade" value=${params.annualUpgrade.teamToBusiness} min=${0.02} max=${0.30} step=${0.01} onChange=${function(v) { updateNested('annualUpgrade', 'teamToBusiness', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Biz\u2192Ent Upgrade" value=${params.annualUpgrade.businessToEnterprise} min=${0.01} max=${0.20} step=${0.01} onChange=${function(v) { updateNested('annualUpgrade', 'businessToEnterprise', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
        </div>

        <div className="slider-group">
          <div className="slider-group-title">Churn</div>
          <${SliderRow} label="Team Churn" value=${params.monthlyLogoChurn.team} min=${0.005} max=${0.08} step=${0.005} onChange=${function(v) { updateNested('monthlyLogoChurn', 'team', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Business Churn" value=${params.monthlyLogoChurn.business} min=${0.002} max=${0.05} step=${0.002} onChange=${function(v) { updateNested('monthlyLogoChurn', 'business', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="Enterprise Churn" value=${params.monthlyLogoChurn.enterprise} min=${0.001} max=${0.02} step=${0.001} onChange=${function(v) { updateNested('monthlyLogoChurn', 'enterprise', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
        </div>

        <div className="slider-group">
          <div className="slider-group-title">Pricing</div>
          <${SliderRow} label="Team $/Seat" value=${params.pricePerSeat.team} min=${10} max=${50} step=${1} onChange=${function(v) { updateNested('pricePerSeat', 'team', v); }} format=${function(v) { return '$' + v; }} />
          <${SliderRow} label="Business $/Seat" value=${params.pricePerSeat.business} min=${20} max=${100} step=${1} onChange=${function(v) { updateNested('pricePerSeat', 'business', v); }} format=${function(v) { return '$' + v; }} />
          <${SliderRow} label="Enterprise $/Seat" value=${params.pricePerSeat.enterprise} min=${50} max=${200} step=${5} onChange=${function(v) { updateNested('pricePerSeat', 'enterprise', v); }} format=${function(v) { return '$' + v; }} />
        </div>

        <div className="slider-group">
          <div className="slider-group-title">AI Economics</div>
          <${SliderRow} label="AI Adoption" value=${params.aiCreditAdoptionRate} min=${0.05} max=${0.80} step=${0.05} onChange=${function(v) { updateParam('aiCreditAdoptionRate', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="AI Rev/User" value=${params.aiRevenuePerActiveUser} min=${0.50} max=${10} step=${0.25} onChange=${function(v) { updateParam('aiRevenuePerActiveUser', v); }} format=${function(v) { return '$' + v.toFixed(2); }} />
          <${SliderRow} label="Inference Cost" value=${params.aiInferenceCostPerCredit} min=${0.0005} max=${0.005} step=${0.0001} onChange=${function(v) { updateParam('aiInferenceCostPerCredit', v); }} format=${function(v) { return '$' + v.toFixed(4); }} />
          <${SliderRow} label="Base Margin" value=${params.baseGrossMargin} min=${0.60} max=${0.98} step=${0.01} onChange=${function(v) { updateParam('baseGrossMargin', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
          <${SliderRow} label="AI Margin" value=${params.aiGrossMargin} min=${0.30} max=${0.85} step=${0.01} onChange=${function(v) { updateParam('aiGrossMargin', v); }} format=${function(v) { return fmtPctDisplay(v * 100); }} />
        </div>

        <div className="note-box">
          Sensitivity is low for conversion/signup sliders because the existing $39.8M MRR base dominates.
        </div>
      </div>

      <div>
        <div className="grid-3 mb-24">
          <div className="kpi-card">
            <div className="kpi-label">Ending ARR</div>
            <div className="kpi-value">${fmtDollar(endingARR)}</div>
            <div className="kpi-sub">
              <span className=${arrDelta >= 0 ? 'delta delta-positive' : 'delta delta-negative'}>
                ${arrDelta >= 0 ? '\u25B2' : '\u25BC'} ${fmtDollar(Math.abs(arrDelta))} vs default
              </span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Ending MRR</div>
            <div className="kpi-value">${fmtDollar(endingMRR)}</div>
            <div className="kpi-sub">
              <span className=${mrrDelta >= 0 ? 'delta delta-positive' : 'delta delta-negative'}>
                ${mrrDelta >= 0 ? '\u25B2' : '\u25BC'} ${fmtDollar(Math.abs(mrrDelta))} vs default
              </span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Ending Customers</div>
            <div className="kpi-value">${fmtNum(endingCust)}</div>
            <div className="kpi-sub">
              <span className=${custDelta >= 0 ? 'delta delta-positive' : 'delta delta-negative'}>
                ${custDelta >= 0 ? '\u25B2' : '\u25BC'} ${fmtNum(Math.abs(custDelta))} vs default
              </span>
            </div>
          </div>
        </div>

        <div className="card mb-24">
          <div className="card-title" style=${{ marginBottom: '16px' }}>Net New MRR Trend</div>
          <${ResponsiveContainer} width="100%" height=${250}>
            <${BarChart} data=${netNewMRRData}>
              <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
              <${XAxis} dataKey="month" tick=${{ fontSize: 11 }} />
              <${YAxis} tickFormatter=${fmtDollar} tick=${{ fontSize: 11 }} />
              <${Tooltip} content=${function(p) { return html`<${CustomTooltip} ...${p} />`; }} />
              <${Legend} />
              <${Bar} dataKey="simulated" fill="#2D7FF9" name="Simulated" radius=${[3,3,0,0]} />
              <${Bar} dataKey="default" fill="#E5E7EB" name="Default" radius=${[3,3,0,0]} />
            </${BarChart}>
          </${ResponsiveContainer}>
        </div>

        <div className="chart-grid">
          <div className="card">
            <div className="card-title" style=${{ marginBottom: '16px' }}>Blended Margin Trend</div>
            <${ResponsiveContainer} width="100%" height=${220}>
              <${LineChart} data=${marginData}>
                <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
                <${XAxis} dataKey="month" tick=${{ fontSize: 11 }} />
                <${YAxis} domain=${[70, 100]} tickFormatter=${function(v) { return v + '%'; }} tick=${{ fontSize: 11 }} />
                <${Tooltip} formatter=${function(v) { return v.toFixed(1) + '%'; }} />
                <${Legend} />
                <${Line} type="monotone" dataKey="simulated" stroke="#2D7FF9" strokeWidth=${2} name="Simulated" dot=${false} />
                <${Line} type="monotone" dataKey="default" stroke="#9CA3AF" strokeWidth=${2} strokeDasharray="4 4" name="Default" dot=${false} />
              </${LineChart}>
            </${ResponsiveContainer}>
          </div>

          <div className="card">
            <div className="card-title" style=${{ marginBottom: '16px' }}>Customer Count</div>
            <${ResponsiveContainer} width="100%" height=${220}>
              <${BarChart} data=${customerData}>
                <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
                <${XAxis} dataKey="month" tick=${{ fontSize: 11 }} />
                <${YAxis} tickFormatter=${fmtNum} tick=${{ fontSize: 11 }} />
                <${Tooltip} formatter=${fmtNum} />
                <${Legend} />
                <${Bar} dataKey="simulated" fill="#2D7FF9" name="Simulated" radius=${[3,3,0,0]} />
                <${Bar} dataKey="default" fill="#E5E7EB" name="Default" radius=${[3,3,0,0]} />
              </${BarChart}>
            </${ResponsiveContainer}>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE 4: SCENARIO PLANNER
// ============================================================
function ScenarioPage(props) {
  var base = props.base, bear = props.bear, bull = props.bull;
  var activeState = useState('base');
  var activeScenario = activeState[0], setActiveScenario = activeState[1];

  function getMetrics(s) {
    var m12 = s.monthlyResults[11];
    var endingARR = m12.closingARR;
    var arrGrowth = (endingARR - STARTING_ARR) / STARTING_ARR;
    var avgMargin = m12.blendedGrossMargin;
    var fcfMargin = avgMargin - 0.55;
    return {
      endingARR: endingARR, arrGrowth: arrGrowth,
      endingCustomers: m12.totalCustomers, avgMargin: avgMargin,
      fcfMargin: fcfMargin,
      val15x: endingARR * 15, val20x: endingARR * 20, val25x: endingARR * 25,
    };
  }

  var bearM = getMetrics(bear);
  var baseM = getMetrics(base);
  var bullM = getMetrics(bull);

  var overlayData = base.monthlyResults.map(function(r, i) {
    return { month: r.label, bear: bear.monthlyResults[i].closingARR, base: r.closingARR, bull: bull.monthlyResults[i].closingARR };
  });

  var valuationData = [
    { multiplier: '15x ARR', bear: bearM.val15x, base: baseM.val15x, bull: bullM.val15x },
    { multiplier: '20x ARR', bear: bearM.val20x, base: baseM.val20x, bull: bullM.val20x },
    { multiplier: '25x ARR', bear: bearM.val25x, base: baseM.val25x, bull: bullM.val25x },
  ];

  var metricRows = [
    { label: 'Ending ARR', bear: fmtDollar(bearM.endingARR), base: fmtDollar(baseM.endingARR), bull: fmtDollar(bullM.endingARR) },
    { label: 'ARR Growth', bear: fmtPctDisplay(bearM.arrGrowth * 100), base: fmtPctDisplay(baseM.arrGrowth * 100), bull: fmtPctDisplay(bullM.arrGrowth * 100) },
    { label: 'Ending Customers', bear: fmtNum(bearM.endingCustomers), base: fmtNum(baseM.endingCustomers), bull: fmtNum(bullM.endingCustomers) },
    { label: 'Avg Blended Margin', bear: fmtPctDisplay(bearM.avgMargin * 100), base: fmtPctDisplay(baseM.avgMargin * 100), bull: fmtPctDisplay(bullM.avgMargin * 100) },
    { label: 'Implied FCF Margin', bear: fmtPctDisplay(bearM.fcfMargin * 100), base: fmtPctDisplay(baseM.fcfMargin * 100), bull: fmtPctDisplay(bullM.fcfMargin * 100) },
    { label: 'Valuation @15x', bear: fmtDollar(bearM.val15x), base: fmtDollar(baseM.val15x), bull: fmtDollar(bullM.val15x) },
    { label: 'Valuation @20x', bear: fmtDollar(bearM.val20x), base: fmtDollar(baseM.val20x), bull: fmtDollar(bullM.val20x) },
  ];

  return html`
    <div>
      <div className="scenario-cards">
        <div className=${'scenario-card' + (activeScenario === 'bear' ? ' active-bear' : '')} onClick=${function() { setActiveScenario('bear'); }}>
          <div className="scenario-card-title" style=${{ color: '#F82B60' }}>Bear</div>
          <div className="scenario-card-desc">${SCENARIO_CONFIGS.bear.description}</div>
        </div>
        <div className=${'scenario-card' + (activeScenario === 'base' ? ' active-base' : '')} onClick=${function() { setActiveScenario('base'); }}>
          <div className="scenario-card-title" style=${{ color: '#2D7FF9' }}>Base</div>
          <div className="scenario-card-desc">${SCENARIO_CONFIGS.base.description}</div>
        </div>
        <div className=${'scenario-card' + (activeScenario === 'bull' ? ' active-bull' : '')} onClick=${function() { setActiveScenario('bull'); }}>
          <div className="scenario-card-title" style=${{ color: '#20C933' }}>Bull</div>
          <div className="scenario-card-desc">${SCENARIO_CONFIGS.bull.description}</div>
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-title" style=${{ marginBottom: '16px' }}>Scenario Comparison</div>
        <div className="table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th style=${{ color: '#F82B60' }}>Bear</th>
                <th style=${{ color: '#2D7FF9' }}>Base</th>
                <th style=${{ color: '#20C933' }}>Bull</th>
              </tr>
            </thead>
            <tbody>
              ${metricRows.map(function(row, i) {
                return html`
                  <tr key=${i}>
                    <td>${row.label}</td>
                    <td>${row.bear}</td>
                    <td style=${{ fontWeight: 600 }}>${row.base}</td>
                    <td>${row.bull}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">ARR Trajectory</div>
              <div className="card-subtitle">12-month projection by scenario</div>
            </div>
          </div>
          <${ResponsiveContainer} width="100%" height=${300}>
            <${AreaChart} data=${overlayData}>
              <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
              <${XAxis} dataKey="month" tick=${{ fontSize: 11 }} />
              <${YAxis} tickFormatter=${fmtDollar} tick=${{ fontSize: 11 }} />
              <${Tooltip} content=${function(p) { return html`<${CustomTooltip} ...${p} />`; }} />
              <${Legend} />
              <${Area} type="monotone" dataKey="bull" stroke="#20C933" fill="#20C933" fillOpacity=${0.08} strokeWidth=${2} name="Bull" />
              <${Area} type="monotone" dataKey="base" stroke="#2D7FF9" fill="#2D7FF9" fillOpacity=${0.08} strokeWidth=${2} name="Base" />
              <${Area} type="monotone" dataKey="bear" stroke="#F82B60" fill="#F82B60" fillOpacity=${0.08} strokeWidth=${2} name="Bear" />
            </${AreaChart}>
          </${ResponsiveContainer}>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Valuation Sensitivity</div>
              <div className="card-subtitle">Enterprise value by ARR multiple</div>
            </div>
          </div>
          <${ResponsiveContainer} width="100%" height=${300}>
            <${BarChart} data=${valuationData}>
              <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
              <${XAxis} dataKey="multiplier" tick=${{ fontSize: 11 }} />
              <${YAxis} tickFormatter=${fmtDollar} tick=${{ fontSize: 11 }} />
              <${Tooltip} content=${function(p) { return html`<${CustomTooltip} ...${p} />`; }} />
              <${Legend} />
              <${Bar} dataKey="bear" fill="#F82B60" name="Bear" radius=${[3,3,0,0]} />
              <${Bar} dataKey="base" fill="#2D7FF9" name="Base" radius=${[3,3,0,0]} />
              <${Bar} dataKey="bull" fill="#20C933" name="Bull" radius=${[3,3,0,0]} />
            </${BarChart}>
          </${ResponsiveContainer}>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE 5: VARIANCE ANALYSIS
// ============================================================
function VariancePage() {
  var filterState = useState('all');
  var filterStatus = filterState[0], setFilterStatus = filterState[1];
  var sortColState = useState('period');
  var sortCol = sortColState[0], setSortCol = sortColState[1];
  var sortDirState = useState('asc');
  var sortDir = sortDirState[0], setSortDir = sortDirState[1];

  var variances = useMemo(function() { return processVarianceData(VARIANCE_DATA); }, []);

  var filtered = useMemo(function() {
    var data = filterStatus === 'all' ? variances : variances.filter(function(v) { return v.status === filterStatus; });
    data = data.slice().sort(function(a, b) {
      var aVal = a[sortCol], bVal = b[sortCol];
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [variances, filterStatus, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(function(d) { return d === 'asc' ? 'desc' : 'asc'; });
    else { setSortCol(col); setSortDir('asc'); }
  }

  var trendData = variances.filter(function(v) { return v.metric === 'total_mrr'; }).map(function(v) {
    return {
      period: new Date(v.period).toLocaleString('default', { month: 'short', timeZone: 'UTC' }),
      variance: v.variancePct * 100,
      plan: v.plan, actual: v.actual,
    };
  });

  var statusColors = { favorable: 'badge-green', watch: 'badge-yellow', unfavorable: 'badge-red' };
  var metricLabels = { total_mrr: 'Total MRR', ai_mrr: 'AI MRR', expansion_mrr: 'Expansion MRR', blended_gross_margin: 'Blended Gross Margin' };

  return html`
    <div>
      <div className="card mb-24">
        <div className="card-header">
          <div>
            <div className="card-title">Variance Detail</div>
            <div className="card-subtitle">Plan vs. Actual with status classification</div>
          </div>
          <div className="filter-group">
            ${['all', 'favorable', 'watch', 'unfavorable'].map(function(f) {
              return html`
                <button key=${f} className=${'filter-btn' + (filterStatus === f ? ' active' : '')} onClick=${function() { setFilterStatus(f); }}>
                  ${f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              `;
            })}
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick=${function() { toggleSort('period'); }}>Period ${sortCol === 'period' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}</th>
                <th className="sortable" onClick=${function() { toggleSort('metric'); }}>Metric ${sortCol === 'metric' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}</th>
                <th>Plan</th>
                <th>Actual</th>
                <th className="sortable" onClick=${function() { toggleSort('variancePct'); }}>Variance ${sortCol === 'variancePct' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(function(v, i) {
                var isMargin = v.metric.indexOf('margin') >= 0;
                var fmtVal = isMargin ? function(val) { return fmtPctDisplay(val * 100); } : fmtDollar;
                return html`
                  <tr key=${i}>
                    <td>${new Date(v.period).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
                    <td style=${{ fontWeight: 500 }}>${metricLabels[v.metric] || v.metric}</td>
                    <td>${fmtVal(v.plan)}</td>
                    <td>${fmtVal(v.actual)}</td>
                    <td>
                      <span style=${{ color: v.variance >= 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>
                        ${v.variance >= 0 ? '+' : ''}${isMargin ? (v.variance * 10000).toFixed(0) + 'bps' : fmtDollar(v.variance)}
                        ${' (' + (v.variancePct >= 0 ? '+' : '') + (v.variancePct * 100).toFixed(1) + '%)'}
                      </span>
                    </td>
                    <td><span className=${'badge ' + statusColors[v.status]}>${v.status}</span></td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">MRR Variance Trend</div>
            <div className="card-subtitle">Total MRR plan vs. actual</div>
          </div>
        </div>
        <${ResponsiveContainer} width="100%" height=${300}>
          <${ComposedChart} data=${trendData}>
            <${CartesianGrid} strokeDasharray="3 3" stroke="#F3F4F6" />
            <${XAxis} dataKey="period" tick=${{ fontSize: 11 }} />
            <${YAxis} yAxisId="left" tickFormatter=${fmtDollar} tick=${{ fontSize: 11 }} />
            <${YAxis} yAxisId="right" orientation="right" tickFormatter=${function(v) { return v.toFixed(1) + '%'; }} tick=${{ fontSize: 11 }} />
            <${Tooltip} />
            <${Legend} />
            <${Bar} yAxisId="left" dataKey="plan" fill="#E5E7EB" name="Plan" radius=${[3,3,0,0]} />
            <${Bar} yAxisId="left" dataKey="actual" fill="#2D7FF9" name="Actual" radius=${[3,3,0,0]} />
            <${Line} yAxisId="right" type="monotone" dataKey="variance" stroke="#20C933" strokeWidth=${2} name="Variance %" dot=${{ r: 4 }} />
          </${ComposedChart}>
        </${ResponsiveContainer}>
      </div>
    </div>
  `;
}

// ============================================================
// PAGE 6: AI NARRATIVES
// ============================================================
function NarrativesPage() {
  var narrative = "Airtable\u2019s February MRR closed at $42,380,000, beating the $41,100,000 plan by 3.1% ($1,280,000 absolute). The beat was concentrated in two sources: an Enterprise deal that slipped from January\u2019s pipeline closing in the first week of February ($131,750 incremental MRR, representing 10.3% of the total variance), and AI credit monetization which contributed $165,000 above plan. The remaining $983,250 of upside came from broad-based new logo conversion running 10bps above the 4.0% plan \u2014 a signal that the September product refresh is sustaining its conversion lift into month five.\n\nGrowth decomposition reveals a bifurcated story. New logo MRR ($1,720,000) and AI MRR ($1,145,000, +16.8% vs. plan) are the heroes \u2014 AI adoption hit 36.2% of paid users versus the 30% plan, driven by the Airtable AI automation launch gaining organic traction. The risk sits in Business tier seat expansion, which decelerated to 3.8% monthly in January from the 5.0% plan assumption, concentrated in sub-6-month cohorts. This is an activation quality issue, not a product-market fit problem: Enterprise seat expansion held at 7.9% (vs. 8.0% plan). If Business expansion doesn\u2019t recover to 4.5%+ by April, trailing NRR will compress approximately 300bps, reducing expansion MRR by $180,000\u2013$240,000 per month by Q3 \u2014 a $2.2M\u2013$2.9M annualized ARR impact. Recommendation: deploy the CSM-led \u201c60-day activation sprint\u201d playbook to the 47 Business accounts in the January cohort showing <3 weekly active users.\n\nBlended gross margin came in at 84.8%, up 40bps sequentially and 20bps below the 85.0% plan. AI MRR now represents 2.7% of total revenue, up from 2.3% in January, with AI gross margin flat at 63% \u2014 inference costs scaled linearly with volume, confirming no unit economics improvement yet. At current trajectory, AI mix reaches 5% by August 2025; at that threshold, every 100bps of AI margin compression reduces blended margin by 5bps. Recommendation: accelerate the inference caching initiative (currently in eng sprint 3) to target 15% cost reduction by June, which would add approximately $85,000\u2013$110,000 in monthly gross profit at projected AI MRR levels.";

  var systemPrompt = "You are the VP of FP&A at a high-growth PLG SaaS company preparing the monthly revenue commentary for the CFO\u2019s board deck. Your analysis must be:\n\n1. CAUSAL, NOT DESCRIPTIVE: Don\u2019t just say \u201cMRR beat plan.\u201d Explain the mechanism: which cohort, which tier, which motion (new logo vs. expansion vs. upgrade) drove the variance, and WHY it happened.\n\n2. QUANTIFIED SECOND-ORDER EFFECTS: Every risk must include a dollar or basis-point impact estimate.\n\n3. SEGMENT-AWARE: Break down performance by tier (Team/Business/Enterprise) and motion (new logo/expansion/churn).\n\n4. FORWARD-LOOKING WITH SCENARIOS: Close with one specific action item and its expected impact.\n\nStructure: Three paragraphs. Under 300 words total.\n- P1: Headline result vs. plan \u2192 primary driver \u2192 the \u201cso what\u201d\n- P2: Growth decomposition by motion \u2192 segment-level hero and risk \u2192 quantified forward impact\n- P3: Margin trajectory \u2192 AI monetization economics \u2192 specific recommendation";

  var userPrompt = "Plan MRR: $41,100,000 | Actual MRR: $42,380,000 (3.1% vs plan)\nPlan ARR: $493,200,000 | Actual ARR: $508,560,000\nAI MRR: $1,145,000 (2.7% of total)\nBlended Gross Margin: 84.8% (plan: 85.0%)";

  var paragraphs = narrative.split('\n\n');

  return html`
    <div>
      <div className="card mb-24">
        <div className="card-header">
          <div>
            <div className="card-title">February 2025 Revenue Commentary</div>
            <div className="card-subtitle">AI-generated board narrative</div>
          </div>
          <span className="badge badge-purple">AI Generated</span>
        </div>
        <div className="narrative-block">
          ${paragraphs.map(function(p, i) { return html`<p key=${i}>${p}</p>`; })}
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">System Prompt</div>
              <div className="card-subtitle">Instruction template for AI narrator</div>
            </div>
          </div>
          <div className="prompt-block">${systemPrompt}</div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">User Prompt</div>
              <div className="card-subtitle">Auto-generated from variance data (Feb 2025)</div>
            </div>
          </div>
          <div className="prompt-block">${userPrompt}</div>
        </div>
      </div>

      <div className="callout mt-16">
        <div className="callout-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <div className="callout-text">
          <strong>How It Works:</strong> This narrative is generated by Claude API using the system prompt above combined with real-time variance data piped from the calculation engine. The prompt automatically ingests plan-vs-actual MRR, tier-level expansion rates, cohort retention curves, and AI monetization metrics \u2014 then generates board-ready commentary with causal analysis, quantified risk estimates, and actionable recommendations. In production, this runs on each monthly close and delivers CFO-ready commentary in under 5 seconds.
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// ABOUT MODAL
// ============================================================
function AboutModal(props) {
  var onClose = props.onClose;

  useEffect(function() {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return html`
    <div className="modal-overlay" onClick=${function(e) { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style=${{ position: 'relative' }}>
        <button className="modal-close" onClick=${onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div className="modal-title">Airtable PLG Intelligence</div>
        <p style=${{ fontSize: '13px', color: '#6B7280' }}>Financial analytics for product-led growth</p>

        <div className="modal-section">
          <h3>What This Dashboard Models</h3>
          <p>Airtable\u2019s product-led growth engine \u2014 modeling the full journey from free signup to enterprise expansion. The model is calibrated to Airtable\u2019s publicly reported metrics:</p>
          <ul>
            <li><strong>$478M ARR</strong> (2024 reported)</li>
            <li><strong>170% NRR</strong> (company-reported)</li>
            <li><strong>166,000 paying companies</strong></li>
            <li>Freemium-first GTM with Team / Business / Enterprise tiers</li>
          </ul>
        </div>

        <div className="modal-section">
          <h3>Calculation Engine</h3>
          <p>Five interconnected modules power the projections:</p>
          <ul>
            <li><strong>PLG Funnel</strong> \u2014 Models the free \u2192 activated \u2192 habit-formed \u2192 feature-gated \u2192 paid conversion pipeline</li>
            <li><strong>Cohort Engine</strong> \u2014 Generates monthly cohorts with tier-specific churn, seat expansion, and AI adoption curves</li>
            <li><strong>Scenario Projector</strong> \u2014 Runs Bear / Base / Bull scenarios with assumption overrides, including 166K legacy customers as aging cohorts</li>
            <li><strong>Variance Detector</strong> \u2014 Compares plan-vs-actual metrics and classifies deviations by materiality</li>
            <li><strong>AI Narrator</strong> \u2014 Generates board-ready commentary using structured prompts and variance data</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MAIN APP
// ============================================================
function App() {
  var pageState = useState(function() {
    var hash = window.location.hash.replace('#', '');
    var found = NAV_ITEMS.find(function(n) { return n.id === hash; });
    return found ? hash : 'overview';
  });
  var page = pageState[0], setPage = pageState[1];

  var aboutState = useState(false);
  var showAbout = aboutState[0], setShowAbout = aboutState[1];

  useEffect(function() {
    function onHash() {
      var hash = window.location.hash.replace('#', '');
      var found = NAV_ITEMS.find(function(n) { return n.id === hash; });
      if (found) setPage(hash);
    }
    window.addEventListener('hashchange', onHash);
    return function() { window.removeEventListener('hashchange', onHash); };
  }, []);

  var navigate = useCallback(function(id) {
    window.location.hash = id;
    setPage(id);
  }, []);

  var overviewProjection = useMemo(function() { return projectScenario(DEFAULT_ASSUMPTIONS, null, 12, STARTING_MRR); }, []);
  var baseScenario = useMemo(function() { return runScenario('base', DEFAULT_ASSUMPTIONS, 12, STARTING_MRR); }, []);
  var bearScenario = useMemo(function() { return runScenario('bear', DEFAULT_ASSUMPTIONS, 12, STARTING_MRR); }, []);
  var bullScenario = useMemo(function() { return runScenario('bull', DEFAULT_ASSUMPTIONS, 12, STARTING_MRR); }, []);

  var content = null;
  if (page === 'overview') content = html`<${OverviewPage} projection=${overviewProjection} />`;
  if (page === 'cohorts') content = html`<${CohortPage} />`;
  if (page === 'simulator') content = html`<${SimulatorPage} />`;
  if (page === 'scenarios') content = html`<${ScenarioPage} base=${baseScenario} bear=${bearScenario} bull=${bullScenario} />`;
  if (page === 'variance') content = html`<${VariancePage} />`;
  if (page === 'narratives') content = html`<${NarrativesPage} />`;

  return html`
    <div className="dashboard">
      <${Sidebar} page=${page} navigate=${navigate} onAbout=${function() { setShowAbout(true); }} />
      <${Header} page=${page} />
      <main className="main">
        ${content}
      </main>
      ${showAbout ? html`<${AboutModal} onClose=${function() { setShowAbout(false); }} />` : null}
    </div>
  `;
}

// ============================================================
// MOUNT
// ============================================================
var rootEl = document.getElementById('root');
if (ReactDOM.createRoot) {
  var root = ReactDOM.createRoot(rootEl);
  root.render(html`<${App} />`);
} else {
  ReactDOM.render(html`<${App} />`, rootEl);
}

} catch(err) {
  document.getElementById('root').innerHTML = '<div style="padding:40px;font-family:Inter,sans-serif;"><h2 style="color:#F82B60;">Error Loading Dashboard</h2><pre style="background:#1F2937;color:#E5E7EB;padding:20px;border-radius:8px;overflow:auto;margin-top:16px;">' + err.message + '\n\n' + err.stack + '</pre></div>';
}

})();
