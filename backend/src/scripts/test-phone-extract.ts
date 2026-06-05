import { extractMobileNumber } from '../controllers/campaignController';

function runTests() {
  const testCases = [
    { text: "Hey, my number is +91 123 4567 890, call me!", expected: "1234567890" },
    { text: "Hey, my number is =91 123 4567 890, call me!", expected: "1234567890" },
    { text: "Hey, my number is 91 123 4567 890, call me!", expected: "1234567890" },
    { text: "Hey, my number is 123 4567 890, call me!", expected: "1234567890" },
    { text: "Hey, my number is +91-123-456-7890, call me!", expected: "1234567890" },
    { text: "Hey, my number is 911234567890, call me!", expected: "1234567890" },
    { text: "Hey, my number is +911234567890, call me!", expected: "1234567890" },
    { text: "Hey, my number is =911234567890, call me!", expected: "1234567890" },
    { text: "Hey, my number is 1234567890, call me!", expected: "1234567890" },
    { text: "No number here, sorry!", expected: "" },
    { text: "The date is 2026-06-05, not a phone number.", expected: "" },
    { text: "Some random large ID 123456789012345.", expected: "" }
  ];

  let passed = true;
  for (const { text, expected } of testCases) {
    const result = extractMobileNumber(text);
    if (result === expected) {
      console.log(`PASS: "${text}" => "${result}"`);
    } else {
      console.error(`FAIL: "${text}" => Expected: "${expected}", Got: "${result}"`);
      passed = false;
    }
  }

  if (passed) {
    console.log("\nALL TESTS PASSED SUCCESSFULLY!");
  } else {
    console.error("\nSOME TESTS FAILED!");
    process.exit(1);
  }
}

runTests();
