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

const BlocklyEditor = ({ initialXml, schema, entity, onWorkspaceChange }) => {
    const blocklyDiv = useRef(null);
    const workspaceRef = useRef(null);

    useEffect(() => {
        window.azqlSchema = schema;
        window.azqlActiveEntity = entity;
    }, [schema, entity]);

    const [toolboxVisible, setToolboxVisible] = React.useState(true);
    const [canUndo, setCanUndo] = React.useState(false);
    const [canRedo, setCanRedo] = React.useState(false);

    const toolboxDefinition = {
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

    useEffect(() => {
        if (!blocklyDiv.current) return;

        const workspace = Blockly.inject(blocklyDiv.current, {
            toolbox: toolboxDefinition,
            theme: DarkTheme,
            scrollbars: true,
            trashcan: true,
            zoom: {
                controls: true,
                wheel: true,
                startScale: 1.0,
                maxScale: 3,
                minScale: 0.3,
                scaleSpeed: 1.2,
                pinch: true
            },
            grid: {
                spacing: 20,
                length: 3,
                colour: 'rgba(255, 255, 255, 0.1)',
                snap: true
            }
        });

        workspaceRef.current = workspace;

        const handleChange = (e) => {
            if (e.type === Blockly.Events.BLOCK_CREATE || e.type === Blockly.Events.BLOCK_DELETE || e.type === Blockly.Events.BLOCK_CHANGE || e.type === Blockly.Events.BLOCK_MOVE) {
                setCanUndo(workspace.undoStack_.length > 0);
                setCanRedo(workspace.redoStack_.length > 0);
            }
            
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

    // Effect to toggle toolbox visibility natively
    useEffect(() => {
        if (blocklyDiv.current && workspaceRef.current) {
            const toolbox = workspaceRef.current.getToolbox();
            if (toolbox && typeof toolbox.setVisible === 'function') {
                toolbox.setVisible(toolboxVisible);
            }
            // Trigger a resize to fill the space
            setTimeout(() => {
                if (workspaceRef.current) {
                    Blockly.svgResize(workspaceRef.current);
                }
            }, 50);
        }
    }, [toolboxVisible]);

    const handleUndo = () => {
        if (workspaceRef.current) workspaceRef.current.undo(false);
    };

    const handleRedo = () => {
        if (workspaceRef.current) workspaceRef.current.undo(true);
    };

    return (
        <div style={{ position: 'relative', height: '600px', width: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div className="blockly-editor-controls" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 100, display: 'flex', gap: '8px' }}>
                <button 
                    className="btn btn-sm btn-ghost" 
                    onClick={handleUndo} 
                    disabled={!canUndo}
                    style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: canUndo ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                    title="Undo"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                </button>
                <button 
                    className="btn btn-sm btn-ghost" 
                    onClick={handleRedo} 
                    disabled={!canRedo}
                    style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: canRedo ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                    title="Redo"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
                </button>
                <button 
                    className="btn btn-sm btn-ghost" 
                    onClick={() => setToolboxVisible(!toolboxVisible)}
                    style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
                    title={toolboxVisible ? "Hide Toolbox" : "Show Toolbox"}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {toolboxVisible ? (
                            <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></>
                        ) : (
                            <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></>
                        )}
                    </svg>
                </button>
            </div>
            <div 
                className={`blockly-editor-container ${!toolboxVisible ? 'toolbox-hidden' : ''}`}
                ref={blocklyDiv} 
                style={{ height: '100%', width: '100%' }}
            />
        </div>
    );
};

export default BlocklyEditor;
