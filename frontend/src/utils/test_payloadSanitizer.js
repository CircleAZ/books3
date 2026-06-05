import { sanitizeFKFields, sanitizeStudentFKs, sanitizeDecimalFields } from './payloadSanitizer.js';

let failedTests = 0;
let passedTests = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`🔴 FAIL: ${message}`);
        failedTests++;
    } else {
        console.log(`🟢 PASS: ${message}`);
        passedTests++;
    }
}

console.log("=== Testing payloadSanitizer.js ===");

// 1. Test sanitizeFKFields
{
    const payload = { school: "", class_obj: "3", division: undefined, sibling: "yes" };
    sanitizeFKFields(payload, ["school", "class_obj", "division", "non_existent"]);
    
    assert(payload.school === null, "sanitizeFKFields converts empty string to null");
    assert(payload.class_obj === "3", "sanitizeFKFields leaves valid value intact");
    assert(payload.division === null, "sanitizeFKFields converts undefined to null");
    assert(payload.sibling === "yes", "sanitizeFKFields leaves untouched fields intact");
    assert(!("non_existent" in payload), "sanitizeFKFields does not add missing fields");
}

// 2. Test sanitizeStudentFKs
{
    const student = { school: "", class_obj: "5", division: undefined, subdivision: "A", name: "Ramesh" };
    sanitizeStudentFKs(student);
    
    assert(student.school === null, "sanitizeStudentFKs converts school empty string to null");
    assert(student.class_obj === "5", "sanitizeStudentFKs leaves class_obj intact");
    assert(student.division === null, "sanitizeStudentFKs converts division undefined to null");
    assert(student.subdivision === "A", "sanitizeStudentFKs leaves subdivision intact");
    assert(student.name === "Ramesh", "sanitizeStudentFKs does not modify non-FK fields");
}

// 3. Test sanitizeDecimalFields
{
    const payload = {
        amount: "  125.50  ",
        discount: "",
        tax: "abc",
        refund: null,
        fee: undefined,
        net: "0",
        gross: 100.2
    };
    sanitizeDecimalFields(payload, ["amount", "discount", "tax", "refund", "fee", "net", "gross"]);
    
    assert(payload.amount === "125.50", "sanitizeDecimalFields trims whitespace and returns string");
    assert(payload.discount === null, "sanitizeDecimalFields converts empty string to null");
    assert(payload.tax === null, "sanitizeDecimalFields converts non-numeric string to null");
    assert(payload.refund === null, "sanitizeDecimalFields converts null to null");
    assert(payload.fee === null, "sanitizeDecimalFields converts undefined to null");
    assert(payload.net === "0", "sanitizeDecimalFields preserves zero as string");
    assert(payload.gross === "100.2", "sanitizeDecimalFields converts float input to trimmed string");
}

console.log("\n=== Test Results ===");
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);

if (failedTests > 0) {
    process.exit(1);
} else {
    console.log("All tests passed successfully.");
    process.exit(0);
}
