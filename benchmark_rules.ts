const rules = Array.from({ length: 100 }, (_, i) => ({
  conditionField: 'field' + (i % 10),
  conditionOperator: i % 2 === 0 ? 'contains' : 'equals',
  conditionValue: 'ValUE' + i,
  actionField: 'action' + i,
  actionValue: 'result' + i
}));

const invoicesList = Array.from({ length: 1000 }, (_, i) => ({
  field0: 'value1',
  field1: 'value' + i,
  field2: 'value2',
  field3: 'some VALUE3',
  field4: 'value4',
  field5: 'value5',
  field6: 'value6',
  field7: 'value7',
  field8: 'value8',
  field9: 'value9',
}));

// Warmup
for (let j = 0; j < 5; j++) {
  for (const dataItem of invoicesList) {
    let processedData = { ...dataItem };
    for (const rule of rules) {
       const { conditionField, conditionOperator, conditionValue, actionField, actionValue } = rule;
       const fieldValue = (processedData as any)[conditionField];
       if (fieldValue !== undefined) {
         let match = false;
         const valStr = String(fieldValue).toLowerCase();
         const condStr = conditionValue.toLowerCase();
         if (conditionOperator === 'contains' && valStr.includes(condStr)) match = true;
         if (conditionOperator === 'equals' && valStr === condStr) match = true;
         if (conditionOperator === 'startsWith' && valStr.startsWith(condStr)) match = true;
         if (conditionOperator === 'endsWith' && valStr.endsWith(condStr)) match = true;

         if (match) {
           (processedData as any)[actionField] = actionValue;
         }
       }
    }
  }
}

const start1 = performance.now();
for (let j = 0; j < 50; j++) {
  for (const dataItem of invoicesList) {
    let processedData = { ...dataItem };
    for (const rule of rules) {
       const { conditionField, conditionOperator, conditionValue, actionField, actionValue } = rule;
       const fieldValue = (processedData as any)[conditionField];
       if (fieldValue !== undefined) {
         let match = false;
         const valStr = String(fieldValue).toLowerCase();
         const condStr = conditionValue.toLowerCase();
         if (conditionOperator === 'contains' && valStr.includes(condStr)) match = true;
         if (conditionOperator === 'equals' && valStr === condStr) match = true;
         if (conditionOperator === 'startsWith' && valStr.startsWith(condStr)) match = true;
         if (conditionOperator === 'endsWith' && valStr.endsWith(condStr)) match = true;

         if (match) {
           (processedData as any)[actionField] = actionValue;
         }
       }
    }
  }
}
const end1 = performance.now();
console.log(`Baseline: ${(end1 - start1).toFixed(2)}ms`);

const hoistedRules = rules.map(r => ({ ...r, condStrLower: String(r.conditionValue).toLowerCase() }));

const start2 = performance.now();
for (let j = 0; j < 50; j++) {
  for (const dataItem of invoicesList) {
    let processedData = { ...dataItem };
    for (const rule of hoistedRules) {
       const { conditionField, conditionOperator, condStrLower, actionField, actionValue } = rule;
       const fieldValue = (processedData as any)[conditionField];
       if (fieldValue !== undefined) {
         let match = false;
         const valStr = String(fieldValue).toLowerCase();
         const condStr = condStrLower;
         if (conditionOperator === 'contains' && valStr.includes(condStr)) match = true;
         if (conditionOperator === 'equals' && valStr === condStr) match = true;
         if (conditionOperator === 'startsWith' && valStr.startsWith(condStr)) match = true;
         if (conditionOperator === 'endsWith' && valStr.endsWith(condStr)) match = true;

         if (match) {
           (processedData as any)[actionField] = actionValue;
         }
       }
    }
  }
}
const end2 = performance.now();
console.log(`Hoisted: ${(end2 - start2).toFixed(2)}ms`);
console.log(`Improvement: ${(((end1 - start1) - (end2 - start2)) / (end1 - start1) * 100).toFixed(2)}%`);
