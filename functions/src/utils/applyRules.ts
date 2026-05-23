export function applyRules(extractedData: any, rules: any[]): any {
  if (!extractedData) return extractedData;
  if (!rules || rules.length === 0) return extractedData;

  const processed = { ...extractedData };
  for (const rule of rules) {
    try {
      const { conditionField, conditionOperator, conditionValue, actionField, actionValue } = rule;
      const v = String(processed[conditionField] ?? '').toLowerCase();
      const c = conditionValue.toLowerCase();
      const match = (conditionOperator === 'contains' && v.includes(c)) ||
                    (conditionOperator === 'equals' && v === c) ||
                    (conditionOperator === 'startsWith' && v.startsWith(c)) ||
                    (conditionOperator === 'endsWith' && v.endsWith(c));
      
      if (match) {
        const isNumberField = [
          'gstRate', 'taxableAmount', 'cgst', 'sgst', 'igst', 'grandTotal',
          'advancePaid', 'balanceDue', 'roundOff'
        ].includes(actionField);
        
        processed[actionField] = isNumberField ? parseFloat(actionValue) : actionValue;
      }
    } catch (err) {
      console.warn('Error applying rule', rule, err);
    }
  }
  return processed;
}
