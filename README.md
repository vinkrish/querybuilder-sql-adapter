# querybuilder-sql-adapter

## Turning SQL WHERE Clauses into React QueryBuilder Rules — Introducing querybuilder-sql-adapter

In modern UI platforms that allow users to build complex filters or queries, it’s common to use visual query builders — drag-and-drop UIs that abstract away the raw SQL or backend logic. One popular and powerful library for this is react-querybuilder. But what happens when you already have SQL WHERE clauses and want to visualize or edit them?

That’s exactly the gap this project aims to fill.

## Why This Was Needed

In many internal admin tools or no-code platforms, users often write or are provided with SQL WHERE clauses. Developers want to:
Parse an existing SQL expression
Visualize it in a frontend UI
Allow editing using a builder like react-querybuilder

However, react-querybuilder doesn’t natively support converting SQL strings into its RuleGroupType format — and while it provides utilities to generate SQL from rules, the reverse transformation (SQL → rules) was missing.

This project solves that.

## What This Project Does

The querybuilder-sql-adapter:
 - Parses SQL WHERE clauses using node-sql-parser
 - Transforms the AST into RuleGroupType format used by react-querybuilder
 - Supports nested expressions, CASE WHEN, COALESCE, IS NULL, BETWEEN, math expressions, and more
 - Outputs rules that can be round-tripped back to SQL
 - Supports advanced expressions using a raw: true structure for complex right-hand values

## Example

```
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

{
  "combinator": "and",
  "rules": [
    {
      "combinator": "and",
      "rules": [
        {
          "combinator": "and",
          "rules": [
            {
              "combinator": "and",
              "rules": [
                {
                  "combinator": "and",
                  "rules": [
                    {
                      "combinator": "and",
                      "rules": [
                        {
                          "combinator": "or",
                          "rules": [
                            {
                              "field": "(field1 + (field2 * 2))",
                              "operator": "<",
                              "value": 100
                            },
                            {
                              "field": "status",
                              "operator": "in",
                              "value": [
                                "active",
                                "pending"
                              ]
                            }
                          ]
                        },
                        {
                          "field": "field3",
                          "operator": "notNull",
                          "value": null
                        }
                      ]
                    },
                    {
                      "field": "discount",
                      "operator": "between",
                      "value": [
                        10,
                        50
                      ]
                    }
                  ]
                },
                {
                  "field": "name",
                  "operator": "like",
                  "value": "A%"
                }
              ]
            },
            {
              "field": "COALESCE(price, CASE WHEN (category = 'electronics') THEN 99 ELSE 49 END)",
              "operator": "=",
              "value": 99
            }
          ]
        },
        {
          "field": "field4",
          "operator": "null",
          "value": null
        }
      ]
    },
    {
      "field": "score",
      "operator": ">",
      "value": "COALESCE(discounted_price, CASE WHEN (field5 = 'gold') THEN 200 ELSE 100 END)"
    }
  ]
}
```

## Internals

The utility walks the parsed SQL AST and recursively transforms expressions into RuleGroupType rules. It handles:
 - Logical operators: AND, OR
 - Math: field1 + field2 * 3
 - Functions: COALESCE, IFNULL, etc.
 - Null checks: IS NULL, IS NOT NULL
 - Conditional logic: CASE WHEN ... THEN ... END
 - Literal handling: strings, numbers, booleans

## Try It Out 

```bash
npm install querybuilder-sql-adapter
```

Check out the repository on GitHub: [querybuilder-sql-adapter](https://github.com/vinkrish/querybuilder-sql-adapter)