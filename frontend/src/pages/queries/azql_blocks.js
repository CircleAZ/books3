import * as Blockly from 'blockly/core';

// Helper to resolve the active entity based on the block's position in the AST tree
function resolveContextEntity(block) {
    let current = block.getSurroundParent();
    while (current) {
        if (current.type === 'azql_relation_filter') {
            let relName = current.getFieldValue('RELATION');
            let parentEntity = resolveContextEntity(current);
            if (parentEntity && window.azqlSchema && window.azqlSchema.entities && window.azqlSchema.entities[parentEntity]) {
                 let rel = window.azqlSchema.entities[parentEntity].relations.find(r => r.name === relName);
                 if (rel) return rel.target;
            }
            return null; // Stop traversal if we can't resolve relation target
        }
        if (current.type === 'azql_query') {
            return current.getFieldValue('ENTITY');
        }
        current = current.getSurroundParent();
    }
    return window.azqlActiveEntity || 'order';
}

function getFieldOptions(block) {
    const entityName = resolveContextEntity(block);
    if (!window.azqlSchema || !window.azqlSchema.entities || !window.azqlSchema.entities[entityName]) {
        return [['(Select Entity)', '']];
    }
    const ent = window.azqlSchema.entities[entityName];
    if (!ent.fields || ent.fields.length === 0) return [['(No Fields)', '']];
    return ent.fields.map(f => [f.label || f.name, f.name]);
}

function getRelationOptions(block) {
    const entityName = resolveContextEntity(block);
    if (!window.azqlSchema || !window.azqlSchema.entities || !window.azqlSchema.entities[entityName]) {
        return [['(Select Entity)', '']];
    }
    const ent = window.azqlSchema.entities[entityName];
    if (!ent.relations || ent.relations.length === 0) return [['(No Relations)', '']];
    return ent.relations.map(r => [r.label || r.name, r.name]);
}

const defineBlocks = () => {
    // 1. Root Query Block
    Blockly.Blocks['azql_query'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("SELECT");
            this.appendStatementInput("SELECT")
                .setCheck(["Column", "Aggregate"]);
            this.appendDummyInput()
                .appendField("FROM")
                .appendField(new Blockly.FieldDropdown([
                    ["Order", "order"],
                    ["Customer", "customer"],
                    ["Product", "product"],
                    ["Purchase Order", "purchaseorder"]
                ]), "ENTITY");
            this.appendValueInput("WHERE")
                .setCheck(["Condition", "LogicalGroup"])
                .appendField("WHERE");
            this.setColour("#2E5BFF");
            this.setTooltip("The root SQL query block.");
        }
    };

    // 2. Logical AND/OR Group
    Blockly.Blocks['azql_logical'] = {
        init: function() {
            this.appendValueInput("LEFT")
                .setCheck(["Condition", "LogicalGroup"]);
            this.appendValueInput("RIGHT")
                .setCheck(["Condition", "LogicalGroup"])
                .appendField(new Blockly.FieldDropdown([["AND", "and"], ["OR", "or"]]), "OPERATOR");
            this.setInputsInline(true);
            this.setOutput(true, "LogicalGroup");
            this.setColour("#FF9F1C");
            this.setTooltip("Connect multiple conditions.");
        }
    };

    // 3. Basic Condition
    Blockly.Blocks['azql_condition'] = {
        init: function() {
            // Using dynamic dropdown for FIELD
            this.appendValueInput("VALUE")
                .appendField(new Blockly.FieldDropdown(() => getFieldOptions(this)), "FIELD")
                .appendField(new Blockly.FieldDropdown([
                    ["=", "="], ["!=", "!="], [">", ">"], ["<", "<"], ["LIKE", "LIKE"], ["IN", "IN"]
                ]), "OPERATOR");
            this.setInputsInline(true);
            this.setOutput(true, "Condition");
            this.setColour("#2EC4B6");
            this.setTooltip("A basic filter condition.");
        }
    };

    // 4. Value Input
    Blockly.Blocks['azql_value'] = {
        init: function() {
            this.appendDummyInput()
                .appendField(new Blockly.FieldTextInput("Value"), "VALUE");
            this.setOutput(true, "String");
            this.setColour("#E71D36");
        }
    };

    // 5. Aggregate Column
    Blockly.Blocks['azql_aggregate'] = {
        init: function() {
            this.appendDummyInput()
                .appendField(new Blockly.FieldDropdown([
                    ["SUM", "SUM"], ["COUNT", "COUNT"], ["AVG", "AVG"], ["MAX", "MAX"], ["MIN", "MIN"]
                ]), "FUNCTION")
                .appendField(" ( ")
                .appendField(new Blockly.FieldDropdown(() => getRelationOptions(this)), "RELATION")
                .appendField(" . ")
                // For the aggregate field, the context is the RELATION target.
                // We'll define a special generator for this specific dropdown.
                .appendField(new Blockly.FieldDropdown(() => {
                    const relName = this.getFieldValue('RELATION');
                    const parentEntity = resolveContextEntity(this);
                    let targetEnt = null;
                    if (parentEntity && window.azqlSchema && window.azqlSchema.entities[parentEntity]) {
                        const rel = window.azqlSchema.entities[parentEntity].relations.find(r => r.name === relName);
                        if (rel) targetEnt = rel.target;
                    }
                    if (!targetEnt || !window.azqlSchema || !window.azqlSchema.entities[targetEnt]) {
                        return [['(Select Relation)', '']];
                    }
                    const ent = window.azqlSchema.entities[targetEnt];
                    if (!ent.fields || ent.fields.length === 0) return [['(No Fields)', '']];
                    return ent.fields.map(f => [f.label || f.name, f.name]);
                }), "FIELD")
                .appendField(" ) AS ")
                .appendField(new Blockly.FieldTextInput("alias"), "ALIAS");
                
            // New WHERE socket for subquery filtering!
            this.appendValueInput("WHERE")
                .setCheck(["Condition", "LogicalGroup"])
                .appendField("WHERE");

            this.setPreviousStatement(true, ["Column", "Aggregate"]);
            this.setNextStatement(true, ["Column", "Aggregate"]);
            this.setColour("#9D4EDD");
        }
    };

    // 6. Simple Column Selection
    Blockly.Blocks['azql_column'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("Column:")
                .appendField(new Blockly.FieldDropdown(() => getFieldOptions(this)), "FIELD");
            this.setPreviousStatement(true, ["Column", "Aggregate"]);
            this.setNextStatement(true, ["Column", "Aggregate"]);
            this.setColour("#9D4EDD");
        }
    };

    // 7. Relation Subquery (HAS_ANY)
    Blockly.Blocks['azql_relation_filter'] = {
        init: function() {
            this.appendValueInput("CONDITIONS")
                .setCheck(["Condition", "LogicalGroup"])
                .appendField("Relation")
                .appendField(new Blockly.FieldDropdown(() => getRelationOptions(this)), "RELATION")
                .appendField(new Blockly.FieldDropdown([
                    ["HAS ANY", "HAS_ANY"], ["HAS ALL", "HAS_ALL"], ["HAS NONE", "HAS_NONE"]
                ]), "OPERATOR")
                .appendField("WHERE");
            this.setInputsInline(true);
            this.setOutput(true, "Condition");
            this.setColour("#2EC4B6");
        }
    };
};

export default defineBlocks;
