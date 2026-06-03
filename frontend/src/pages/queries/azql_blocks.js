import * as Blockly from 'blockly/core';

// Ensure we don't redefine blocks if this file is hot-reloaded
const defineBlocks = () => {
    Blockly.defineBlocksWithJsonArray([
        // Root Query Block
        {
            "type": "azql_query",
            "message0": "SELECT %1 FROM %2 WHERE %3",
            "args0": [
                {
                    "type": "input_statement",
                    "name": "SELECT",
                    "check": ["Column", "Aggregate"]
                },
                {
                    "type": "field_dropdown",
                    "name": "ENTITY",
                    "options": [
                        ["Order", "order"],
                        ["Customer", "customer"],
                        ["Product", "product"],
                        ["Purchase Order", "purchaseorder"]
                    ]
                },
                {
                    "type": "input_value",
                    "name": "WHERE",
                    "check": ["Condition", "LogicalGroup"]
                }
            ],
            "colour": 230,
            "tooltip": "The root SQL query block.",
            "helpUrl": ""
        },
        
        // Logical AND/OR Group
        {
            "type": "azql_logical",
            "message0": "%1 %2 %3",
            "args0": [
                {
                    "type": "input_value",
                    "name": "LEFT",
                    "check": ["Condition", "LogicalGroup"]
                },
                {
                    "type": "field_dropdown",
                    "name": "OPERATOR",
                    "options": [
                        ["AND", "and"],
                        ["OR", "or"]
                    ]
                },
                {
                    "type": "input_value",
                    "name": "RIGHT",
                    "check": ["Condition", "LogicalGroup"]
                }
            ],
            "inputsInline": true,
            "output": "LogicalGroup",
            "colour": 210,
            "tooltip": "Connect multiple conditions.",
            "helpUrl": ""
        },
        
        // Basic Condition
        {
            "type": "azql_condition",
            "message0": "%1 %2 %3",
            "args0": [
                {
                    "type": "field_input",
                    "name": "FIELD",
                    "text": "status"
                },
                {
                    "type": "field_dropdown",
                    "name": "OPERATOR",
                    "options": [
                        ["=", "="],
                        ["!=", "!="],
                        [">", ">"],
                        ["<", "<"],
                        ["LIKE", "LIKE"],
                        ["IN", "IN"]
                    ]
                },
                {
                    "type": "input_value",
                    "name": "VALUE"
                }
            ],
            "inputsInline": true,
            "output": "Condition",
            "colour": 120,
            "tooltip": "A basic filter condition.",
            "helpUrl": ""
        },
        
        // Value Input (String/Number)
        {
            "type": "azql_value",
            "message0": "%1",
            "args0": [
                {
                    "type": "field_input",
                    "name": "VALUE",
                    "text": "Paid"
                }
            ],
            "output": "String",
            "colour": 160,
            "tooltip": "A literal value.",
            "helpUrl": ""
        },
        
        // Aggregate Column
        {
            "type": "azql_aggregate",
            "message0": "%1 ( %2 . %3 ) AS %4",
            "args0": [
                {
                    "type": "field_dropdown",
                    "name": "FUNCTION",
                    "options": [
                        ["SUM", "SUM"],
                        ["COUNT", "COUNT"],
                        ["AVG", "AVG"],
                        ["MAX", "MAX"],
                        ["MIN", "MIN"]
                    ]
                },
                {
                    "type": "field_input",
                    "name": "RELATION",
                    "text": "items"
                },
                {
                    "type": "field_input",
                    "name": "FIELD",
                    "text": "line_total"
                },
                {
                    "type": "field_input",
                    "name": "ALIAS",
                    "text": "total_val"
                }
            ],
            "previousStatement": ["Column", "Aggregate"],
            "nextStatement": ["Column", "Aggregate"],
            "colour": 290,
            "tooltip": "An aggregate column derived from a relation.",
            "helpUrl": ""
        },
        
        // Simple Column Selection
        {
            "type": "azql_column",
            "message0": "Column: %1",
            "args0": [
                {
                    "type": "field_input",
                    "name": "FIELD",
                    "text": "display_id"
                }
            ],
            "previousStatement": ["Column", "Aggregate"],
            "nextStatement": ["Column", "Aggregate"],
            "colour": 290,
            "tooltip": "Select a specific column.",
            "helpUrl": ""
        },
        
        // Relation Subquery (HAS_ANY)
        {
            "type": "azql_relation_filter",
            "message0": "Relation %1 %2 %3",
            "args0": [
                {
                    "type": "field_input",
                    "name": "RELATION",
                    "text": "items"
                },
                {
                    "type": "field_dropdown",
                    "name": "OPERATOR",
                    "options": [
                        ["HAS ANY", "HAS_ANY"],
                        ["HAS ALL", "HAS_ALL"],
                        ["HAS NONE", "HAS_NONE"]
                    ]
                },
                {
                    "type": "input_value",
                    "name": "CONDITIONS",
                    "check": ["Condition", "LogicalGroup"]
                }
            ],
            "output": "Condition",
            "colour": 120,
            "tooltip": "Filter based on a related entity.",
            "helpUrl": ""
        }
    ]);
};

export default defineBlocks;
