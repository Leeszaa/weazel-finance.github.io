document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const views = {
        'dashboard': document.getElementById('dashboard-view'),
        'income': document.getElementById('income-view'),
        'expenses': document.getElementById('expenses-view'),
        'salaries': document.getElementById('salaries-view'),
        'additional': document.getElementById('additional-view'),
        'calculation': document.getElementById('calculation-view'),
        'monthly': document.getElementById('monthly-view'),
        'transactions': document.getElementById('transactions-view')
    };
    const navButtons = document.querySelectorAll('.nav-btn');
    const loadingDiv = document.getElementById('loading');

    // Navigation and Tab Switching Logic
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state on buttons
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Show corresponding view
            Object.keys(views).forEach(key => {
                views[key].style.display = key === btn.dataset.tab ? 'block' : 'none';
            });
        });
    });

    let globalData = {};
    let additionalExpenses = [];

    try {
        const [transRes, addRes] = await Promise.all([
            fetch('transactions.json'),
            fetch('additional_expenses.json')
        ]);

        if (!transRes.ok) throw new Error("Laden der Transaktionen fehlgeschlagen");
        const rawData = await transRes.json();
        
        if (addRes.ok) {
            additionalExpenses = await addRes.json();
        } else {
            console.warn("Keine zusätzlichen Ausgaben gefunden.");
        }
        
        // 1. Process Data
        globalData = processTransactions(rawData);
        globalData.additionalExpenses = additionalExpenses;
        
        // 2. Render Views
        renderDashboard(globalData);
        renderAdditionalExpensesView(globalData.additionalExpenses); // New View
        renderIncomeView(globalData.transactions);
        renderExpenseView(globalData.transactions);
        renderSalaries(globalData.salaries);
        renderCalculation(globalData.salaries, globalData.monthlyStats, globalData.additionalExpenses);
        renderMonthlyReport(globalData.monthlyStats, globalData.salaries);
        renderAllTransactions(globalData.transactions);
        
        loadingDiv.style.display = 'none';
        
    } catch (err) {
        loadingDiv.textContent = "Fehler beim laden der Daten: " + err.message + ". Stelle sicher, dass ein lokaler Server läuft (python -m http.server)";
        console.error(err);
    }
});


function calculateHypotheticalImpact(salaries) {
    // 1. Filter targets
    const targets = salaries.filter(s => {
        const p = s.person.toLowerCase();
        return p.includes('alice') || p.includes('luke');
    });

    // 2. Aggregate by Person & Month
    const agg = {};
    targets.forEach(s => {
        const key = `${s.person}|${s.month}`;
        if (!agg[key]) {
            agg[key] = { person: s.person, month: s.month, hours: 0, actual: 0 };
        }
        agg[key].hours += s.hours;
        agg[key].actual += s.amount;
    });

    // 3. Calculate Hypo Cost with Cap
    let totalDiff = 0;
    let totalHypo = 0;
    let totalActual = 0;

    const rows = Object.values(agg).map(item => {
        const effectiveHours = Math.min(item.hours, 60); // Max 60h Cap
        const hypoCost = -(effectiveHours * 100); // 100$ / h

        const diff = hypoCost - item.actual; // (New - Old)

        totalHypo += hypoCost;
        totalActual += item.actual;
        totalDiff += diff;

        return {
            ...item,
            effectiveHours,
            hypoCost,
            diff
        };
    });

    return { totalDiff, totalHypo, totalActual, rows };
}



function renderAdditionalExpensesView(items) {
    // Ensure we handle empty or null safely
    const safeItems = items || [];
    
    const body = document.getElementById('additional-body');
    const totalEl = document.getElementById('additional-total-view');
    const countEl = document.getElementById('additional-count-view');

    if (!body || !totalEl || !countEl) {
        console.warn("Additional Expenses View elements not found");
        return;
    }

    const total = safeItems.reduce((acc, i) => acc + i.amount, 0);
    totalEl.textContent = formatCurrency(total);
    countEl.textContent = safeItems.length;

    body.innerHTML = '';
    
    if (safeItems.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center">Keine zusätzlichen Ausgaben vorhanden</td></tr>';
        return;
    }

    safeItems.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.date}</td>
            <td><span class="badge badge-red">${i.category}</span></td>
            <td>${i.description}</td>
            <td class="negative">${formatCurrency(i.amount)}</td>
        `;
        body.appendChild(tr);
    });
}


function renderIncomeView(transactions) {
    const valid = transactions.filter(t => t.amount_value > 0);
    const filterEl = document.getElementById('income-category-filter');
    const tbody = document.getElementById('income-body');
    const totalEl = document.getElementById('inc-total');
    const countEl = document.getElementById('inc-count');

    // Populate Filter
    const categories = [...new Set(valid.map(t => t.category))].sort();
    // Reset options if needed or just check length
    if (filterEl.options.length <= 1) {
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            filterEl.appendChild(opt);
        });
        filterEl.addEventListener('change', () => renderTable());
    }

    const renderTable = () => {
        const cat = filterEl.value;
        const filtered = cat === 'all' ? valid : valid.filter(t => t.category === cat);
        
        // Stats
        const sum = filtered.reduce((a, t) => a + t.amount_value, 0);
        totalEl.textContent = formatCurrency(sum);
        countEl.textContent = filtered.length;

        // Table
        tbody.innerHTML = '';
        filtered.slice(0, 500).forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${t.date}</td>
                <td><span class="badge badge-green">${t.category}</span></td>
                <td>${t.description} <br> <small>${t.details}</small></td>
                <td class="positive">${t.amount}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    renderTable();
}

function renderExpenseView(transactions) {
    const valid = transactions.filter(t => t.amount_value < 0);
    const filterEl = document.getElementById('expense-category-filter');
    const tbody = document.getElementById('expense-body');
    const totalEl = document.getElementById('exp-total');
    const countEl = document.getElementById('exp-count');

    // Populate Filter
    const categories = [...new Set(valid.map(t => t.category))].sort();
    if (filterEl.options.length <= 1) {
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            filterEl.appendChild(opt);
        });
        filterEl.addEventListener('change', () => renderTable());
    }

    const renderTable = () => {
        const cat = filterEl.value;
        const filtered = cat === 'all' ? valid : valid.filter(t => t.category === cat);
        
        // Stats
        const sum = filtered.reduce((a, t) => a + t.amount_value, 0);
        totalEl.textContent = formatCurrency(sum);
        countEl.textContent = filtered.length;

        // Table
        tbody.innerHTML = '';
        filtered.slice(0, 500).forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${t.date}</td>
                <td><span class="badge badge-red">${t.category}</span></td>
                <td>${t.description} <br> <small>${t.details}</small></td>
                <td class="negative">${t.amount}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    renderTable();
}

function processTransactions(raw) {
    const salaries = [];
    const monthlyStats = {};

    const transactions = raw.map(t => {
        // Parse date "16.02.2026 00:00"
        const [d, m, y_part] = t.date.split('.');
        const [y, _time] = y_part.split(' ');
        const monthKey = `${y}-${m}`; 

        // Identify transaction types
        // Fix: Case-insensitive check to catch typos like "Kaptialeinzahlung" or lower-case "einzahlung" inside words
        const detailsLower = (t.details || "").toLowerCase();
        const descLower = (t.description || "").toLowerCase();
        
        const isEquity = detailsLower.includes('kapitaleinzahlung') || 
                         descLower.includes('kapitaleinzahlung') ||
                         detailsLower.includes('kaptialeinzahlung') || // Explicit typo fix
                         ((detailsLower.includes('einzahlung') || descLower.includes('einzahlung')) && t.amount_value > 1000); 
                         // Heuristic: Large deposits might be equity if not labeled, but let's stick to "Kapitaleinzahlung" primarily.
        
        const isSalary = (t.description && t.description.includes('Gehalt')) || 
                         (t.details && t.details.includes('Gehalt'));

        const val = t.amount_value;
        const category = getCategory(t);
        const entry = { ...t, monthKey, isEquity, isSalary, amount_value: val, category };

        // --- Monthly Aggregation ---
        if (!monthlyStats[monthKey]) {
            monthlyStats[monthKey] = {
                month: monthKey,
                income: 0,
                expenses: 0,
                equityIn: 0,
                net: 0,
                netNoEquity: 0
            };
        }
        const mStat = monthlyStats[monthKey];

        if (val > 0) {
            mStat.income += val;
            if (isEquity) mStat.equityIn += val;
        } else {
            mStat.expenses += val;
        }

        mStat.net += val;
        if (!isEquity) {
            mStat.netNoEquity += val;
        }

        // --- Salary Extraction ---
        if (isSalary) {
            // Regex to find content inside quotes after Gehalt: Gehalt "Luke Barret"
            // Also handle format: Luke Barret (#...) - Gehalt "Luke Barret" (5,5 h)
            let personName = "Unbekannt";
            let hours = 0;

            const nameMatch = t.details.match(/Gehalt "([^"]+)"/);
            if (nameMatch) {
                personName = nameMatch[1];
            } else {
                // Fallback: try to extract from start of string if detail starts with name
                const startName = t.details.split(' (#')[0];
                if (startName) personName = startName;
            }

            const hoursMatch = t.details.match(/\(([\d,]+)\s*h\)/);
            if (hoursMatch) {
                hours = parseFloat(hoursMatch[1].replace(',', '.'));
            }

            salaries.push({
                person: personName,
                hours: hours,
                amount: val, // Negative number usually
                month: monthKey,
                date: t.date
            });
        }

        return entry;
    });

    // Convert stats object to array and sort by month desc
    const statsArray = Object.values(monthlyStats).sort((a, b) => b.month.localeCompare(a.month));

    const categories = analyzeCategories(transactions);

    return { 
        transactions, 
        monthlyStats: statsArray, 
        salaries,
        categories
    };
}
    
function analyzeCategories(transactions) {
    const income = {};
    const expenses = {};

    transactions.forEach(t => {
        const val = t.amount_value;
        const cat = t.category; // Now pre-tagged in processTransactions

        if (val > 0) {
            income[cat] = (income[cat] || 0) + val;
        } else {
            expenses[cat] = (expenses[cat] || 0) + Math.abs(val);
        }
    });

    return { income, expenses };
}

function getCategory(t) {
    const val = t.amount_value;
    const desc = (t.description || "").toLowerCase();
    const det = (t.details || "").toLowerCase();
    const text = desc + " " + det;

    if (val > 0) {
        if (text.includes("venture music")) return "Venture Music";
        if (text.includes("werbung") || text.includes("anzeige") || text.includes("sponsoring")) return "Werbung & Sponsoring";
        if (text.includes("spende")) return "Spenden";
        if (text.includes("event") || text.includes("ticket") || text.includes("eintritt")) return "Events & Tickets";
        if (text.includes("staat") || text.includes("förderung") || text.includes("subvention")) return "Staatliche Förderung";
        
        // Fixed Equity Logic
        if (text.includes("kapitaleinzahlung") || text.includes("kaptialeinzahlung") || ((text.includes("einzahlung") || text.includes("kapital")) && val > 1000)) return "Eigenkapital";

        return "Sonstige Einnahmen";
    } else {
        if (text.includes("gehalt") || text.includes("lohn")) return "Gehälter";
        if (text.includes("tanken") || text.includes("kfz") || text.includes("werkstatt") || text.includes("tankstelle")) return "Fahrzeug & Mobilität";
        if (text.includes("steuer") || text.includes("gebühr")) return "Steuern & Abgaben";
        if (text.includes("event") || text.includes("party") || text.includes("gewinn")) return "Veranstaltungskosten";
        if (text.includes("kauf") || text.includes("erwerb") || text.includes("shop")) return "Einkäufe & Material";
        
        return "Sonstige Ausgaben";
    }
}

function formatCurrency(val) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(val);
}

// ================= RENDER FUNCTIONS =================

function renderDashboard(data) {
    // 1. Calculate Totals
    const totalTransactions = data.transactions.length;
    const totalIncome = data.transactions.reduce((acc, t) => t.amount_value > 0 ? acc + t.amount_value : acc, 0);
    const totalExpenses = data.transactions.reduce((acc, t) => t.amount_value < 0 ? acc + t.amount_value : acc, 0);
    const totalEquity = data.transactions.filter(t => t.isEquity).reduce((acc, t) => acc + t.amount_value, 0);
    
    // Additional Expenses
    const additionalExp = (data.additionalExpenses || []).reduce((acc, i) => acc + i.amount, 0);

    // Total Net (Balance)
    const netBalance = totalIncome + totalExpenses; 
    
    // Net without Equity (Operational Result from Bank)
    const netNoEquity = netBalance - totalEquity;

    // Adjusted Net (Operational - Additional)
    const netAdjusted = netNoEquity - additionalExp;

    const netEl = document.getElementById('dash-net');
    netEl.textContent = formatCurrency(netBalance);
    netEl.className = netBalance >= 0 ? 'positive' : 'negative';

    const netNoEqEl = document.getElementById('dash-net-no-equity');
    netNoEqEl.textContent = formatCurrency(netNoEquity);
    netNoEqEl.className = netNoEquity >= 0 ? 'positive' : 'negative';

    // Total Salaries
    const totalSalaryCost = data.salaries.reduce((acc, s) => acc + s.amount, 0);
    document.getElementById('dash-salaries').textContent = formatCurrency(totalSalaryCost);
    document.getElementById('dash-equity').textContent = formatCurrency(totalEquity);

    // Hypothetical Profit Calculation (Alice & Luke @ 100$, max 60h)
    const hypoData = calculateHypotheticalImpact(data.salaries);
    
    // Hypo Profit (Operational - HypoDiff)
    
    // 1. Hypo Operational Profit (Bank + Wage Fix)
    const hypoProfitOperational = netNoEquity + hypoData.totalDiff; 
    
    // 2. Grand Total Profit (Bank + Wage Fix - Additional Expenses)
    const grandTotalProfit = hypoProfitOperational - additionalExp;

    const hypoProfitEl = document.getElementById('dash-hypo-profit');
    if (hypoProfitEl) {
        // Show the Grand Total here as it's the main scenario
        hypoProfitEl.textContent = formatCurrency(grandTotalProfit);
        hypoProfitEl.className = grandTotalProfit >= 0 ? 'positive' : 'negative';
        
        // Add detail about composition
        const existingSmall = hypoProfitEl.nextElementSibling;
        if(existingSmall) {
             existingSmall.textContent = `Inkl. nicht getätigte Lohnzahlungen ggü. Alice und Luke (${formatCurrency(hypoData.totalDiff)}) & Privatausgaben (-${formatCurrency(additionalExp)}) und Herrausrechnung der Eigenkapitalzuführung (${formatCurrency(totalEquity)}) )`;
        }
    }

    // Update Additional Expenses Card if exists
    const addExpEl = document.getElementById('dash-additional');
    if (addExpEl) {
        addExpEl.textContent = formatCurrency(additionalExp);
    }
    
    const netAdjEl = document.getElementById('dash-net-adjusted');
    if (netAdjEl) {
        netAdjEl.textContent = formatCurrency(netAdjusted);
        netAdjEl.className = netAdjusted >= 0 ? 'positive' : 'negative';
    }

    // 2. Render Chart
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    const chartStats = data.monthlyStats.slice(0, 12).reverse();
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartStats.map(m => m.month),
            datasets: [
                {
                    label: 'Gesamtbilanz',
                    data: chartStats.map(m => m.net),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    yAxisID: 'y',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Operatives Ergebnis',
                    data: chartStats.map(m => m.netNoEquity),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.0)',
                    yAxisID: 'y',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { labels: { color: '#94a3b8' } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: '#334155' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });

    renderBreakdownCharts(data.categories);
}

function renderBreakdownCharts(data) {
    const incomeRaw = data.income;
    const expensesRaw = data.expenses;

    const renderPie = (elementId, dataset, labels, colors) => {
        new Chart(document.getElementById(elementId), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataset,
                    backgroundColor: colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right', 
                        labels: { 
                            color: '#94a3b8',
                            boxWidth: 12,
                            padding: 15
                        } 
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                if (context.parsed !== null) {
                                    label += new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };

    const incomeSorted = Object.entries(incomeRaw).sort((a,b) => b[1] - a[1]);
    const expensesSorted = Object.entries(expensesRaw).sort((a,b) => b[1] - a[1]);

    renderPie(
        'incomeChart', 
        incomeSorted.map(e => e[1]), 
        incomeSorted.map(e => e[0]),
        ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6']
    );

    renderPie(
        'expenseChart', 
        expensesSorted.map(e => e[1]), 
        expensesSorted.map(e => e[0]),
        ['#ef4444', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#64748b', '#a855f7']
    );
}

function renderSalaries(salaries) {
    const tbody = document.getElementById('salary-body');
    const filter = document.getElementById('salary-person-filter'); 
    
    const persons = [...new Set(salaries.map(s => s.person))].sort();
    
    if (filter.options.length <= 1) {
        persons.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            filter.appendChild(opt);
        });
        
        filter.addEventListener('change', () => {
            renderSalaryTable(salaries, filter.value);
        });
    }

    renderSalaryTable(salaries, 'all');
}

function renderSalaryTable(allSalaries, personFilter) {
    const tbody = document.getElementById('salary-body');
    tbody.innerHTML = '';

    let filtered = allSalaries;
    if (personFilter !== 'all') {
        filtered = allSalaries.filter(s => s.person === personFilter);
    }

    filtered.sort((a, b) => {
        return b.month.localeCompare(a.month) || a.person.localeCompare(b.person);
    });

    const displayList = filtered.slice(0, 500);

    displayList.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.person}</td>
            <td>${s.month}</td>
            <td>${s.hours.toFixed(1)} h</td>
            <td class="negative">${formatCurrency(s.amount)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCalculation(salaries, monthlyStats, additionalExpenses) {
    const tbody = document.getElementById('calc-body'); 
    
    // Use shared calculation logic (Alice & Luke @ 100$ / max 60h)
    const hypoData = calculateHypotheticalImpact(salaries);

    // Private Expenses Total
    const totalAdditional = (additionalExpenses || []).reduce((acc, i) => acc + i.amount, 0);

    // Sort by month desc, then person
    hypoData.rows.sort((a, b) => b.month.localeCompare(a.month) || a.person.localeCompare(b.person));

    tbody.innerHTML = '';
    
    hypoData.rows.forEach(s => {
        const tr = document.createElement('tr');
        const hourLabel = s.hours > 60 ? `${s.hours.toFixed(1)} h (Capped at 60)` : `${s.hours.toFixed(1)} h`;
        
        tr.innerHTML = `
            <td>${s.person}</td>
            <td>${s.month}</td>
            <td>${hourLabel}</td>
            <td style="color:#f87171;">${formatCurrency(s.hypoCost)}</td>
            <td style="color:#f87171;">${formatCurrency(s.actual)}</td>
            <td class="${s.diff >= 0 ? 'positive' : 'negative'}">${formatCurrency(s.diff)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('calc-hypo-cost').classList.add('negative');
    document.getElementById('calc-actual-cost').classList.add('negative');
    
    document.getElementById('calc-hypo-cost').textContent = formatCurrency(hypoData.totalHypo);
    document.getElementById('calc-actual-cost').textContent = formatCurrency(hypoData.totalActual);
    
    const diffEl = document.getElementById('calc-diff');
    diffEl.textContent = formatCurrency(hypoData.totalDiff);
    diffEl.className = hypoData.totalDiff >= 0 ? 'positive' : 'negative';

    // --- Hypothetical Total Net Profit (Operational) ---
    const currentTotalOperationalNet = monthlyStats.reduce((acc, m) => acc + m.netNoEquity, 0);
    const currentTotalNet = monthlyStats.reduce((acc, m) => acc + m.net, 0);
    
    const hypoNet = currentTotalOperationalNet + hypoData.totalDiff - totalAdditional;
    const hypoNetEquity = currentTotalNet + hypoData.totalDiff - totalAdditional;

    const hypoNetEl = document.getElementById('calc-hypo-net');
    if(hypoNetEl) {
        hypoNetEl.textContent = formatCurrency(hypoNet);
        hypoNetEl.className = hypoNet >= 0 ? 'positive' : 'negative';
        hypoNetEl.style.color = hypoNet >= 0 ? '#f59e0b' : '#ef4444'; 
    }
    
    const hypoNetEqEl = document.getElementById('calc-hypo-net-equity');
    if(hypoNetEqEl) {
        hypoNetEqEl.textContent = formatCurrency(hypoNetEquity);
        hypoNetEqEl.className = hypoNetEquity >= 0 ? 'positive' : 'negative';
    }
}

function renderMonthlyReport(stats, allSalaries) {
    const tbody = document.getElementById('monthly-body');
    tbody.innerHTML = '';
    
    stats.forEach(m => {
        const tr = document.createElement('tr');
        
        // Filter salaries for THIS specific month
        const monthSalaries = allSalaries.filter(s => s.month === m.month);

        // Calculate Hypo Diff just for this month
        const hypoData = calculateHypotheticalImpact(monthSalaries);
        
        // NetNoEquity includes ACTUAL salaries.
        const hypoNetOperational = m.netNoEquity + hypoData.totalDiff;
        const hypoNetTotal = m.net + hypoData.totalDiff; // With Equity

        const netClass = m.net >= 0 ? 'positive' : 'negative';
        const netNoEqClass = m.netNoEquity >= 0 ? 'positive' : 'negative';
        const hypoNetOpClass = hypoNetOperational >= 0 ? 'positive' : 'negative';
        const hypoNetTotalClass = hypoNetTotal >= 0 ? 'positive' : 'negative';

        tr.innerHTML = `
            <td style="font-weight:600;">${m.month}</td>
            <td class="positive">${formatCurrency(m.income)}</td>
            <td class="negative">${formatCurrency(m.expenses)}</td>
            
            <!-- Real Cashflow -->
            <td class="${netClass}">${formatCurrency(m.net)}</td>
            <!-- Scenario Cashflow (Real + Full Wages) -->
            <td class="${hypoNetTotalClass}" style="color: #94a3b8;">${formatCurrency(hypoNetTotal)}</td>

            <!-- Operational -->
            <td class="${netNoEqClass}" style="border-left: 2px solid #334155; background: rgba(255,255,255,0.03);">${formatCurrency(m.netNoEquity)}</td>
            <!-- Scenario Operational (Biz + Full Wages) -->
            <td class="${hypoNetOpClass}" style="border-left: 1px solid #334155; color: #f59e0b;">${formatCurrency(hypoNetOperational)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAllTransactions(transactions) {
    const tbody = document.getElementById('transaction-body');
    const searchInput = document.getElementById('search-input');
    
    let timeout = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            doRender(e.target.value.toLowerCase());
        }, 300);
    });

    const doRender = (term) => {
        tbody.innerHTML = '';
        
        let result = transactions;
        if (term) {
            result = transactions.filter(t => 
                (t.description && t.description.toLowerCase().includes(term)) ||
                (t.details && t.details.toLowerCase().includes(term)) ||
                (t.amount && t.amount.toLowerCase().includes(term))
            );
        }
        
        const page = result.slice(0, 200);

        page.forEach(t => {
            const tr = document.createElement('tr');
            const amountClass = t.amount_value >= 0 ? 'positive' : 'negative';
            
            const desc = t.description || '';
            const details = t.details || '';

            tr.innerHTML = `
                <td style="white-space:nowrap; font-size:0.9em;">${t.date}</td>
                <td>${desc}</td>
                <td style="font-size: 0.85em; color: #94a3b8;">${details}</td>
                <td class="${amountClass}" style="text-align:right;">${t.amount}</td>
            `;
            tbody.appendChild(tr);
        });

        if (result.length > 200) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="4" style="text-align:center; padding:1rem;">... ${result.length - 200} weitere Transaktionen (Suche verfeinern) ...</td>`;
            tbody.appendChild(tr);
        }
    };

    doRender('');
}
