import { Parser } from 'node-sql-parser';
import type { RuleGroupType, RuleType } from 'react-querybuilder';

const parser = new Parser();

export function parseWhereClauseToRuleGroup(
  whereClause: string,
  fieldSources?: Array<{ name: string; label?: string }>
): RuleGroupType {
  const ast = parser.astify(`SELECT * FROM dummy WHERE ${whereClause}`);
  const whereAst = Array.isArray(ast) ? ast[0]?.where : ast.where;

  const ruleGroup = normalizeRuleGroup(walkSqlAst(whereAst, fieldSources));

  return ruleGroup;
}

function walkSqlAst(node: any, fieldSources?: Array<{ name: string; label?: string }>): RuleGroupType | RuleType {
  if (!node) {
    return { combinator: 'and', rules: [] };
  }

  switch (node.type) {
    case 'binary_expr': {
      if (node.operator === 'AND' || node.operator === 'OR') {
        return {
          combinator: node.operator.toLowerCase() as 'and' | 'or',
          rules: [
            walkSqlAst(node.left, fieldSources),
            walkSqlAst(node.right, fieldSources),
          ],
        };
      }

      if (node.operator === 'BETWEEN') {
        return {
          field: buildExpressionString(node.left, fieldSources),
          operator: 'between',
          value: [extractValue(node.right.value[0]), extractValue(node.right.value[1])],
        };
      }

      if (node.operator === 'IN' || node.operator === 'NOT IN') {
        return {
          field: buildExpressionString(node.left, fieldSources),
          operator: node.operator === 'IN' ? 'in' : 'notIn',
          value: node.right.value.map((v: any) => extractValue(v)),
        };
      }

      return {
        field: buildExpressionString(node.left, fieldSources),
        operator: mapSqlOperatorToQueryBuilder(node.operator),
        value: extractValue(node.right),
      };
    }

    case 'unary_expr': {
      if (node.operator === 'IS NULL' || node.operator === 'IS NOT NULL') {
        return {
          field: buildExpressionString(node.expr, fieldSources),
          operator: node.operator === 'IS NULL' ? 'null' : 'notNull',
          value: null,
        };
      }
      throw new Error(`Unsupported unary_expr: ${node.operator}`);
    }

    case 'paren': {
      return walkSqlAst(node.expr, fieldSources);
    }

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

function buildExpressionString(
  node: any,
  fieldSources?: Array<{ name: string; label?: string }>
): string {
  switch (node.type) {
    case 'column_ref': {
      const fieldName = node.column;

      if (fieldSources) {
        const match = fieldSources.find((f) => f.name === fieldName);
        if (match) return match.name;
      }

      return fieldName;
    }

    case 'binary_expr': {
      const left = buildExpressionString(node.left, fieldSources);
      const right = buildExpressionString(node.right, fieldSources);
      return `(${left} ${node.operator} ${right})`;
    }

    case 'number':
    case 'string':
    case 'single_quote_string':
      return String(extractValue(node));

    case 'function': {
      const fname = node.name.toUpperCase();

      if (fname === 'COALESCE' || fname === 'IFNULL') {
        const args = node.args.map((arg: any) =>
          buildExpressionString(arg, fieldSources)
        ).join(', ');
        return `${fname}(${args})`;
      }

      throw new Error(`Unsupported function: ${fname}`);
    }

    case 'case': {
      const whens = node.args.map(
        (arg: any) => `WHEN (${buildExpressionString(arg.cond, fieldSources)}) THEN ${buildExpressionString(arg.result, fieldSources)}`
      );

      const elsePart = node.default
        ? ` ELSE ${buildExpressionString(node.default, fieldSources)}`
        : '';

      return `CASE ${whens.join(' ')}${elsePart} END`;
    }

    default:
      throw new Error(`Unsupported expression node: ${node.type}`);
  }
}

function extractValue(node: any): any {
  if (node.type === 'number' || node.type === 'string') {
    return node.value;
  }
  if (node.type === 'single_quote_string') {
    return node.value;
  }
  if (node.type === 'bool') {
    return node.value === 'true';
  }
  throw new Error(`Unsupported value node: ${JSON.stringify(node)}`);
}

function mapSqlOperatorToQueryBuilder(operator: string): string {
  switch (operator.toUpperCase()) {
    case '=':
      return '=';
    case '>':
      return '>';
    case '<':
      return '<';
    case '>=':
      return '>=';
    case '<=':
      return '<=';
    case '!=':
    case '<>':
      return '!=';
    case 'LIKE':
      return 'like';
    case 'NOT LIKE':
      return 'notLike';
    default:
      throw new Error(`Unsupported SQL operator: ${operator}`);
  }
}

function normalizeRuleGroup(group: RuleGroupType | RuleType): RuleGroupType {
  if ('combinator' in group) return group;

  return {
    combinator: 'and',
    rules: [group],
  };
}
