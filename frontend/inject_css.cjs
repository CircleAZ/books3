const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const componentsDir = path.join(srcDir, 'styles', 'components');

const quarantineList = [
    'src/pages/finance/BankAccounts.css',
    'src/pages/finance/EmployeeExpenses.css',
    'src/pages/finance/EmployeeSalaries.css',
    'src/pages/finance/ExpenseCategories.css',
    'src/pages/finance/ExpenseDetails.css',
    'src/pages/finance/FinanceIndex.css',
    'src/pages/finance/LenderList.css',
    'src/pages/finance/RecordTransaction.css',
    'src/pages/inventory/AddProduct.css',
    'src/components/inventory/ProductForm.css',
    'src/pages/NewOrder.css',
    'src/pages/orders/OrderDetails.css',
    'src/pages/returns/ReturnDetails.css',
    'src/pages/customers/AddCustomer.css',
    'src/pages/customers/CustomerList.css',
    'src/pages/settings/EmployeeManagement.css',
    'src/pages/settings/ReceiptSettings.css',
    'src/pages/settings/RolesPermissions.css',
    'src/pages/settings/StoreSettings.css',
    'src/pages/reports/CustomerReports.css',
    'src/pages/reports/InventoryReports.css',
    'src/pages/reports/SalesReports.css',
    'src/pages/messaging/GatewayManagement.css',
    'src/pages/messaging/MessagingIndex.css',
    'src/pages/Login.css'
].map(p => path.join(__dirname, p).replace(/\\/g, '/'));

const classMappings = [
    {
        cssFile: 'page-layout.css',
        regex: /className=['"`][^'"`]*\b(page-header|page-title|page-subtitle)\b[^'"`]*['"`]/
    },
    {
        cssFile: 'form-layout.css',
        regex: /className=['"`][^'"`]*\b(form-group|form-row|form-grid)\b[^'"`]*['"`]/
    },
    {
        cssFile: 'modal-system.css',
        regex: /className=['"`][^'"`]*\b(modal-overlay|modal-content|modal-header)\b[^'"`]*['"`]/
    },
    {
        cssFile: 'data-table.css',
        regex: /className=['"`][^'"`]*\b(data-table|table-card)\b[^'"`]*['"`]/
    }
];

function getJsxFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getJsxFiles(fullPath, fileList);
        } else if (fullPath.endsWith('.jsx')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

const allJsx = getJsxFiles(path.join(srcDir, 'pages')).concat(getJsxFiles(path.join(srcDir, 'components')));

let injectedCount = 0;

for (const jsxFile of allJsx) {
    const jsxNormalized = jsxFile.replace(/\\/g, '/');
    const cssEquivalent = jsxNormalized.replace(/\.jsx$/, '.css');
    
    // Check if quarantined
    if (quarantineList.includes(cssEquivalent)) {
        continue;
    }

    let content = fs.readFileSync(jsxFile, 'utf8');
    let needsSave = false;
    let importsToInject = [];

    for (const mapping of classMappings) {
        if (mapping.regex.test(content)) {
            const targetCssPath = path.join(componentsDir, mapping.cssFile);
            let relPath = path.relative(path.dirname(jsxFile), targetCssPath).replace(/\\/g, '/');
            if (!relPath.startsWith('.')) relPath = './' + relPath;
            
            const importStmt = `import '${relPath}';`;
            if (!content.includes(importStmt)) {
                importsToInject.push(importStmt);
            }
        }
    }

    if (importsToInject.length > 0) {
        // Find last import statement
        const importRegex = /^import\s+.*?;?\s*$/gm;
        let lastMatch = null;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            lastMatch = match;
        }

        const injectString = '\n' + importsToInject.join('\n');
        
        if (lastMatch) {
            const insertPos = lastMatch.index + lastMatch[0].length;
            content = content.slice(0, insertPos) + injectString + content.slice(insertPos);
        } else {
            content = injectString + '\n' + content;
        }

        fs.writeFileSync(jsxFile, content, 'utf8');
        console.log(`Injected into ${jsxFile.replace(__dirname, '')}: ${importsToInject.join(', ')}`);
        injectedCount++;
    }
}

console.log(`\nInjection complete. Modified ${injectedCount} orphaned files.`);
