import * as Blockly from 'blockly/core';

// Create a new generator
export const azqlGenerator = new Blockly.Generator('AZQL');

// Define how to extract values from inputs
azqlGenerator.valueToCode = function(block, name, order) {
    const targetBlock = block.getInputTargetBlock(name);
    if (!targetBlock) {
        return null; // No block connected
    }
    return this.blockToCode(targetBlock);
};

// Root Query Block
azqlGenerator.forBlock['azql_query'] = function(block, generator) {
    const entity = block.getFieldValue('ENTITY');
    
    // Parse SELECT statement (columns and aggregates)
    let columns = [];
    let aggregates = [];
    
    let selectBlock = block.getInputTargetBlock('SELECT');
    while (selectBlock) {
        const item = generator.blockToCode(selectBlock);
        if (item) {
            if (item.type === 'column') {
                columns.push(item.field);
            } else if (item.type === 'aggregate') {
                aggregates.push(item.payload);
            }
        }
        selectBlock = selectBlock.getNextBlock();
    }
    
    // Parse WHERE statement
    const whereTree = generator.valueToCode(block, 'WHERE', 0);
    
    const ast = {
        query_type: 'visual',
        entity: entity,
        columns: columns.length > 0 ? columns : null,
        aggregates: aggregates,
        rules: whereTree || { combinator: 'and', rules: [] }
    };
    
    return JSON.stringify(ast, null, 2);
};

// Logical Group
azqlGenerator.forBlock['azql_logical'] = function(block, generator) {
    const operator = block.getFieldValue('OPERATOR');
    const left = generator.valueToCode(block, 'LEFT', 0);
    const right = generator.valueToCode(block, 'RIGHT', 0);
    
    const rules = [];
    if (left) rules.push(left);
    if (right) rules.push(right);
    
    // If one side is missing, just return the other side to avoid empty groups
    if (rules.length === 1) return rules[0];
    if (rules.length === 0) return null;
    
    return {
        combinator: operator,
        rules: rules
    };
};

// Basic Condition
azqlGenerator.forBlock['azql_condition'] = function(block, generator) {
    const field = block.getFieldValue('FIELD');
    const operator = block.getFieldValue('OPERATOR');
    const valueStr = generator.valueToCode(block, 'VALUE', 0);
    
    return {
        field: field,
        operator: operator,
        value: valueStr !== null ? valueStr : ""
    };
};

// Value Input
azqlGenerator.forBlock['azql_value'] = function(block) {
    const val = block.getFieldValue('VALUE');
    return val;
};

// Column Selection
azqlGenerator.forBlock['azql_column'] = function(block) {
    return {
        type: 'column',
        field: block.getFieldValue('FIELD')
    };
};

// Aggregate Selection
azqlGenerator.forBlock['azql_aggregate'] = function(block, generator) {
    const filterRules = generator.valueToCode(block, 'WHERE', 0);
    return {
        type: 'aggregate',
        payload: {
            function: block.getFieldValue('FUNCTION'),
            relation: block.getFieldValue('RELATION'),
            field: block.getFieldValue('FIELD'),
            alias: block.getFieldValue('ALIAS'),
            filter_rules: filterRules || { combinator: 'and', rules: [] }
        }
    };
};

// Relation Subquery
azqlGenerator.forBlock['azql_relation_filter'] = function(block, generator) {
    const relation = block.getFieldValue('RELATION');
    const operator = block.getFieldValue('OPERATOR');
    const innerRules = generator.valueToCode(block, 'CONDITIONS', 0);
    
    return {
        field: `~${relation}`,
        operator: operator,
        value: innerRules || { combinator: 'and', rules: [] }
    };
};

export default azqlGenerator;
