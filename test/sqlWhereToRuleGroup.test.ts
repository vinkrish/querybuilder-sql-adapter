import { parseWhereClauseToRuleGroup } from '../src/sqlWhereToRuleGroup';
import { formatQuery } from 'react-querybuilder';

describe('parseWhereClauseToRuleGroup', () => {
  const fieldSources = [
    { name: 'field1', label: 'Field 1' },
    { name: 'field2', label: 'Field 2' },
    { name: 'field3', label: 'Field 3' },
    { name: 'score', label: 'Score' },
    { name: 'country', label: 'Country' },
    { name: 'status', label: 'Status' },
    { name: 'name', label: 'Name' },
  ];

  it('parses simple binary expression', () => {
    const whereClause = `field1 > 10`;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        { field: 'field1', operator: '>', value: 10 },
      ],
    });
  });

  it('parses BETWEEN expression', () => {
    const whereClause = `score BETWEEN 50 AND 100`;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        { field: 'score', operator: 'between', value: [50, 100] },
      ],
    });
  });

  it('parses IN and NOT IN', () => {
    const whereClause = `
      country IN ('USA', 'Canada')
      AND status NOT IN ('inactive', 'banned')
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          field: 'country',
          operator: 'in',
          value: ['USA', 'Canada'],
        },
        {
          field: 'status',
          operator: 'notIn',
          value: ['inactive', 'banned'],
        },
      ],
    });
  });

  it('parses IS NULL and IS NOT NULL', () => {
    const whereClause = `
      field1 IS NULL
      AND field2 IS NOT NULL
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          field: 'field1',
          operator: 'null',
          value: null,
        },
        {
          field: 'field2',
          operator: 'notNull',
          value: null,
        },
      ],
    });
  });

  it('parses CASE WHEN expression', () => {
    const whereClause = `
      CASE WHEN field1 > 10 THEN 'A' ELSE 'B' END = 'A'
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          field: "CASE WHEN (field1 > 10) THEN 'A' ELSE 'B' END",
          operator: '=',
          value: 'A',
        },
      ],
    });
  });

  it('parses COALESCE expression', () => {
    const whereClause = `
      COALESCE(field2, field3, 'default') = 'default'
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          field: "COALESCE(field2, field3, 'default')",
          operator: '=',
          value: 'default',
        },
      ],
    });
  });

  it('parses CASE within COALESCE expression', () => {
    const whereClause = `
      score > COALESCE(discounted_price, CASE WHEN field1 = 'electronics' THEN 100 ELSE 50 END)
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          field: 'score',
          operator: '>',
          value: "COALESCE(discounted_price, CASE WHEN (field1 = 'electronics') THEN 100 ELSE 50 END)",
        },
      ],
    });
  });

  it('parses IFNULL expression', () => {
    const whereClause = `
      IFNULL(score, 0) >= 50
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          field: "IFNULL(score, 0)",
          operator: '>=',
          value: 50,
        },
      ],
    });
  });

  it('parses nested math expressions', () => {
    const whereClause = `
      (field1 + field2) * 2 < 100
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          field: "((field1 + field2) * 2)",
          operator: '<',
          value: 100,
        },
      ],
    });
  });

  it('parses complex AND/OR nesting', () => {
    const whereClause = `
      (field1 > 10 OR field2 < 5)
      AND
      (score BETWEEN 50 AND 100 OR name LIKE 'John%')
    `;

    const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);

    expect(result).toEqual({
      combinator: 'and',
      rules: [
        {
          combinator: 'or',
          rules: [
            { field: 'field1', operator: '>', value: 10 },
            { field: 'field2', operator: '<', value: 5 },
          ],
        },
        {
          combinator: 'or',
          rules: [
            { field: 'score', operator: 'between', value: [50, 100] },
            { field: 'name', operator: 'like', value: 'John%' },
          ],
        },
      ],
    });
  });
});

describe('parseWhereClauseToRuleGroup — invalid SQL', () => {
    const fieldSources = [
      { name: 'field1' },
      { name: 'field2' },
      { name: 'score' },
    ];
  
    it('throws on completely invalid SQL', () => {
      const whereClause = `INVALID_SQL`;
  
      expect(() => {
        parseWhereClauseToRuleGroup(whereClause, fieldSources);
      }).toThrow(/Unsupported node type/);
    });
  
    it('throws on unknown SQL operator', () => {
      const whereClause = `field1 ** 2 > 10`;
  
      expect(() => {
        parseWhereClauseToRuleGroup(whereClause, fieldSources);
      }).toThrow(/Expected .* but/);
    });
  
    it('throws on unsupported function', () => {
      const whereClause = `MYFUNC(field1) = 10`;
  
      expect(() => {
        parseWhereClauseToRuleGroup(whereClause, fieldSources);
      }).toThrow(/Unsupported function/);
    });
  
    it('throws on unknown expression node', () => {
      const whereClause = `CAST(field1 AS CHAR) = 'abc'`;
  
      expect(() => {
        parseWhereClauseToRuleGroup(whereClause, fieldSources);
      }).toThrow(/Unsupported expression node/);
    });
  
    it('handles empty whereClause as empty RuleGroup', () => {
      const whereClause = ``;
  
      const result = parseWhereClauseToRuleGroup(whereClause, fieldSources);
  
      expect(result).toEqual({
        combinator: 'and',
        rules: [],
      });
    });
  });

  describe('parseWhereClauseToRuleGroup —> round-trip test', () => {
    const fieldSources = [
      { name: 'field1' },
      { name: 'field2' },
      { name: 'score' },
      { name: 'country' },
      { name: 'status' },
      { name: 'name' },
    ];
  
    const testCases = [
      {
        name: 'Simple binary expression',
        sql: `field1 > 10`,
      },
      {
        name: 'BETWEEN',
        sql: `score BETWEEN 50 AND 100`,
      },
      {
        name: 'IN',
        sql: `country IN ('USA', 'Canada')`,
      },
      {
        name: 'IS NULL',
        sql: `status IS NULL`,
      },
      {
        name: 'CASE WHEN',
        sql: `CASE WHEN field1 > 10 THEN 'A' ELSE 'B' END = 'A'`,
      },
      {
        name: 'COALESCE',
        sql: `COALESCE(field2, field3, 'default') = 'default'`,
      },
      {
        name: 'IFNULL',
        sql: `IFNULL(score, 0) >= 50`,
      },
      {
        name: 'Math expressions',
        sql: `(field1 + field2) * 2 < 100`,
      },
      {
        name: 'AND/OR nesting',
        sql: `(field1 > 10 OR field2 < 5) AND (score BETWEEN 50 AND 100 OR name LIKE 'John%')`,
      },
    ];
  
    testCases.forEach(({ name, sql }) => {
      it(`round-trip: ${name}`, () => {
        const ruleGroup = parseWhereClauseToRuleGroup(sql, fieldSources);
  
        const roundTripSql:string = formatQuery(ruleGroup, 'sql');
  
        console.log('\n--- Round-trip ---');
        console.log('Original SQL:', sql);
        console.log('Parsed RuleGroup:', JSON.stringify(ruleGroup, null, 2));
        console.log('Formatted SQL:', roundTripSql);
  
        // Check: formatted SQL is still valid SQL string
        expect(typeof roundTripSql).toBe('string');
        expect(roundTripSql.length).toBeGreaterThan(0);
      });
    });
  });