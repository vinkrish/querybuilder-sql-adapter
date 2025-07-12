import { Parser } from 'node-sql-parser';
import type { RuleGroupType, RuleType } from 'react-querybuilder';

const parser = new Parser();

export function parseWhereClauseToRuleGroup(
  whereClause: string,
  fieldSources?: Array<{ name: string; label?: string }>
): RuleGroupType {
  if (!whereClause.trim()) {
    return {
      combinator: 'and',
      rules: [],
    };
  }
  const ast = parser.astify(`SELECT * FROM dummy WHERE ${whereClause}`) as any;
  const whereAst = Array.isArray(ast) ? ast[0]?.where : ast.where;

  const ruleGroup = normalizeRuleGroup(walkSqlAst(whereAst, fieldSources));

  return ruleGroup;
}

function walkSqlAst(node: any, fieldSources?: Array<{ name: string; label?: string }>): RuleGroupType | RuleType {
  if (!node) {
    return { combinator: 'and', rules: [] };
  }
  // console.log('walkSqlAst', node, fieldSources);
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
          value: [extractValue(node.right.value[0], fieldSources), extractValue(node.right.value[1], fieldSources)],
        };
      }

      if (node.operator === 'IN' || node.operator === 'NOT IN') {
        return {
          field: buildExpressionString(node.left, fieldSources),
          operator: node.operator === 'IN' ? 'in' : 'notIn',
          value: node.right.value.map((v: any) => extractValue(v, fieldSources)),
        };
      }

      if (node.operator === 'IS' && node.right.type === 'null') {
        return {
          field: buildExpressionString(node.left, fieldSources),
          operator: 'null',
          value: null,
        };
      }

      if (node.operator === 'IS NOT' && node.right.type === 'null') {
        return {
          field: buildExpressionString(node.left, fieldSources),
          operator: 'notNull',
          value: null,
        };
      }
      
      if (node.operator === 'IS' && node.right.type === 'unary_expr' && node.right.operator === 'NOT' && node.right.expr.type === 'null') {
        return {
          field: buildExpressionString(node.left, fieldSources),
          operator: 'notNull',
          value: null,
        };
      }

      return {
        field: buildExpressionString(node.left, fieldSources),
        operator: mapSqlOperatorToQueryBuilder(node.operator),
        value: extractValue2(node.right),
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
  fieldSources?: Array<{ name: string; label?: string }>,
  asLiteral: boolean = false
): string {
  if (!node || typeof node !== 'object') {
    throw new Error(`Invalid expression node: ${JSON.stringify(node)}`);
  }
  // console.log('buildExpressionString', node, fieldSources, asLiteral);
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
      const left = buildExpressionString(node.left, fieldSources, true);
      const right = buildExpressionString(node.right, fieldSources, true);
      return `(${left} ${node.operator} ${right})`;
    }

    // case 'number':
    // case 'string':
    // case 'single_quote_string':
    //   return String(extractValue(node));

    case 'string':
    case 'single_quote_string':
      return asLiteral ? `'${node.value}'` : node.value;

    case 'number':
      return `${node.value}`;

    case 'bool':
      return node.value === 'true' ? 'TRUE' : 'FALSE';

    case 'function': {
      let fname: string;

      if (typeof node.name === 'string') {
        fname = node.name.toUpperCase();
      } else if (
        typeof node.name === 'object' &&
        Array.isArray(node.name.name) &&
        node.name.name[0]?.value
      ) {
        fname = String(node.name.name[0].value).toUpperCase();
      } else {
        throw new Error(`Unsupported or missing function name in: ${JSON.stringify(node)}`);
      }

      const rawArgs = Array.isArray(node.args?.value)
        ? node.args.value
        : Array.isArray(node.args)
        ? node.args
        : node.args !== undefined
        ? [node.args]
        : [];

      if (fname === 'COALESCE' || fname === 'IFNULL') {
        const args = rawArgs
          .map((arg: any) => buildExpressionString(arg, fieldSources, true))
          .join(', ');
        return `${fname}(${args})`;
      }

      throw new Error(`Unsupported function: ${fname}`);
    }

    case 'case': {
      const args = node.args || [];
      const whenClauses = args.filter((arg: any) => arg.type === 'when');
      const elseClause = args.find((arg: any) => arg.type === 'else');
    
      const whenParts = whenClauses.map((arg: any) => {
        if (!arg.cond || !arg.result) {
          throw new Error(`Invalid WHEN clause: ${JSON.stringify(arg)}`);
        }
        const whenExpr = buildExpressionString(arg.cond, fieldSources, true);
        const thenExpr = buildExpressionString(arg.result, fieldSources, true);
        return `WHEN ${whenExpr} THEN ${thenExpr}`; // `WHEN (${whenExpr}) THEN ${thenExpr}`;
      });
    
      const elsePart = elseClause
        ? ` ELSE ${buildExpressionString(elseClause.result, fieldSources, true)}`
        : '';
    
      return `CASE ${whenParts.join(' ')}${elsePart} END`;
    }       

    default:
      throw new Error(`Unsupported expression node: ${node.type}`);
  }
}

function extractValue(node: any, fieldSources?: Array<{ name: string; label?: string }>): any {
  if (node.type === 'string' || node.type === 'single_quote_string') {
    return `${node.value}`;
  }
  if (node.type === 'number') {
    return node.value;
  }
  if (node.type === 'bool') {
    return node.value === 'true';
  }
  if (node.type === 'function' || node.type === 'case') {
    return buildExpressionString(node, fieldSources, true);
  }
  throw new Error(`Unsupported value node: ${JSON.stringify(node)}`);
}

function extractValue2(node: any, fieldSources?: Array<{ name: string; label?: string }>): any {
  if (node.type === 'string' || node.type === 'single_quote_string' || node.type === 'number') {
    return node.value;
  }
  if (node.type === 'bool') {
    return node.value === 'true';
  }
  if (node.type === 'function' || node.type === 'case') {
    return buildExpressionString(node, fieldSources, true);
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
