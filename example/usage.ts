import { parseWhereClauseToRuleGroup } from '../src/sqlWhereToRuleGroup';
import { formatQuery } from 'react-querybuilder';

const fieldSources = [
  { name: 'field1' },
  { name: 'field2' },
  { name: 'status' },
  { name: 'field3' },
  { name: 'discount' },
  { name: 'name' },
  { name: 'price' },
  { name: 'category' },
  { name: 'field4' },
  { name: 'score' },
  { name: 'discounted_price' },
  { name: 'field5' },
];

const whereClause = `
(
  (field1 + field2 * 2 < 100 OR status IN ('active', 'pending'))
  AND field3 IS NOT NULL
  AND discount BETWEEN 10 AND 50
  AND name LIKE 'A%'
  AND COALESCE(price, CASE WHEN category = 'electronics' THEN 99 ELSE 49 END) = 99
  AND field4 IS NULL
  AND score > COALESCE(discounted_price, CASE WHEN field5 = 'gold' THEN 200 ELSE 100 END)
)
`;

const ruleGroup = parseWhereClauseToRuleGroup(whereClause, fieldSources);

console.log('Parsed RuleGroup:', JSON.stringify(ruleGroup, null, 2));

// Round-trip test: Convert back to SQL and compare, formatQuery (from react-querybuilder) doesn't support complex expressions so be careful with the output
const roundTripSql:string = formatQuery(ruleGroup, 'sql');

console.log('Round-trip SQL:', roundTripSql);
