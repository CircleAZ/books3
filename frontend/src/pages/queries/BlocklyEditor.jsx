import React, { useEffect, useRef } from 'react';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
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
                    name: 'Core',
                    colour: '210',
                    contents: [
                        { kind: 'block', type: 'azql_select' },
                        { kind: 'block', type: 'azql_where' }
                    ]
                },
                {
                    kind: 'category',
                    name: 'Fields',
                    colour: '160',
                    contents: [
                        { kind: 'block', type: 'azql_field' }
                    ]
                }
            ]
        };

        const workspace = Blockly.inject(blocklyDiv.current, {
            toolbox: toolbox,
            scrollbars: true,
            trashcan: true
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
            ref={blocklyDiv} 
            style={{ height: '600px', width: '100%', border: '1px solid #ccc' }}
        />
    );
};

export default BlocklyEditor;
