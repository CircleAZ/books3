import React, { useEffect, useRef } from 'react';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import DarkTheme from '@blockly/theme-dark';
import * as En from 'blockly/msg/en';
import defineBlocks from './azql_blocks';
import azqlGenerator from './azql_generator';

// Set language
Blockly.setLocale(En);
defineBlocks();

const BlocklyEditor = ({ initialXml, onWorkspaceChange }) => {
    const blocklyDiv = useRef(null);
    const workspaceRef = useRef(null);

    useEffect(() => {
        if (!blocklyDiv.current) return;

        // Toolbox defines what blocks are available
        const toolbox = {
            kind: 'categoryToolbox',
            contents: [
                {
                    kind: 'category',
                    name: 'Root',
                    colour: '#2E5BFF',
                    contents: [
                        { kind: 'block', type: 'azql_query' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'Columns & Aggregates',
                    colour: '#9D4EDD',
                    contents: [
                        { kind: 'block', type: 'azql_column' },
                        { kind: 'block', type: 'azql_aggregate' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'Filters & Logic',
                    colour: '#2EC4B6',
                    contents: [
                        { kind: 'block', type: 'azql_condition' },
                        { kind: 'block', type: 'azql_relation_filter' },
                        { kind: 'block', type: 'azql_logical' },
                        { kind: 'block', type: 'azql_value' }
                    ]
                }
            ]
        };

        const workspace = Blockly.inject(blocklyDiv.current, {
            toolbox: toolbox,
            theme: DarkTheme,
            scrollbars: true,
            trashcan: true,
            grid: {
                spacing: 20,
                length: 3,
                colour: 'rgba(255, 255, 255, 0.1)',
                snap: true
            }
        });

        workspaceRef.current = workspace;

        const handleChange = (e) => {
            if (e.isUiEvent) return;
            
            try {
                // Find the root query block to generate the AST
                const blocks = workspace.getTopBlocks(false);
                const queryBlock = blocks.find(b => b.type === 'azql_query');
                
                let ast = null;
                if (queryBlock) {
                    ast = JSON.parse(azqlGenerator.blockToCode(queryBlock));
                }
                
                if (onWorkspaceChange) {
                    onWorkspaceChange(ast);
                }
            } catch (err) {
                console.error("Blockly AST Generation Error:", err);
            }
        };

        workspace.addChangeListener(handleChange);

        return () => {
            workspace.removeChangeListener(handleChange);
            workspace.dispose();
        };
    }, []);

    return (
        <div 
            className="blockly-editor-container"
            ref={blocklyDiv} 
            style={{ height: '600px', width: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
        />
    );
};

export default BlocklyEditor;
