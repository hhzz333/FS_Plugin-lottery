import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { bitable, dashboard, DashboardState, IConfig } from '@lark-base-open/js-sdk';
import { useConfig as useDashboardConfig } from '../../hooks';
import './style.scss';

const var_zjsc = 10000;

const festiveIcons = [
    '🌹', '🌸', '💐', '🌺', '🌻', '🌼', '🥀', '🌷',
    '🎉', '🎊', '🎁', '🎀', '🎈', '✨', '🌟', '⭐',
    '🎌', '🏳️', '🏴', '🏁', '🚩', '🎏',
    '🎆', '🎇', '🧨', '🪅', '🪩', '🎪', '🎭',
    '❤️', '💖', '💝', '💫', '🔥', '🌈', '☀️', '🎯',
    '🏆', '🥇', '🥈', '🥉', '👑', '💎', '💰', '🎨'
];

const fireworkColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
];

export default function LotteryAct(props: { bgColor: string }) {
    const [isAnimating, setIsAnimating] = useState(false);
    const [status, setStatus] = useState('等待抽奖');
    const [statusClass, setStatusClass] = useState('status-text');
    const [floatingIcons, setFloatingIcons] = useState<Array<{ id: number; icon: string; style: React.CSSProperties }>>([]);
    const [fallenIcons, setFallenIcons] = useState<Array<{ id: number; icon: string; style: React.CSSProperties }>>([]);
    const [confetti, setConfetti] = useState<Array<{ id: number; style: React.CSSProperties }>>([]);
    const [fireworks, setFireworks] = useState<Array<{ id: number; style: React.CSSProperties }>>([]);
    const [particles, setParticles] = useState<Array<{ id: number; style: React.CSSProperties }>>([]);

    const [isConfig, setIsConfig] = useState(false);
    const [tableList, setTableList] = useState<Array<{ id: string; name: string }>>([]);
    const [fieldList, setFieldList] = useState<Array<{ id: string; name: string; type: number }>>([]);
    const [currentPrize, setCurrentPrize] = useState('');
    const [currentAward, setCurrentAward] = useState('');
    const [serverStatus, setServerStatus] = useState('');
    const [currentRecordId, setCurrentRecordId] = useState('');
    const [showReadyStatus, setShowReadyStatus] = useState(false);
    const [configError, setConfigError] = useState('');

    const defaultConfig = useMemo(() => ({
        prizeTableId: '',
        prizeNameFieldId: '',
        awardFieldId: '',
        confirmFieldId: '',
        serverStatusFieldId: ''
    }), []);

    const [config, setConfig] = useState(defaultConfig);
    const configRef = useRef(defaultConfig);
    const isConfigRef = useRef(false);
    const lastServerStatusRef = useRef('');
    const isProcessingRef = useRef(false);
    const textFields = useMemo(() => fieldList.filter(f => f.type === 1), [fieldList]);
    const selectFields = useMemo(() => fieldList.filter(f => f.type === 3), [fieldList]);
    const checkboxFields = useMemo(() => fieldList.filter(f => f.type === 7), [fieldList]);

    const containerRef = useRef<HTMLDivElement>(null);
    const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fireworkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const iconIdRef = useRef(0);
    const confettiIdRef = useRef(0);
    const fireworkIdRef = useRef(0);
    const particleIdRef = useRef(0);

    const getRandomIcon = () => {
        return festiveIcons[Math.floor(Math.random() * festiveIcons.length)];
    };

    const loadTableList = useCallback(async () => {
        try {
            const tableList = await bitable.base.getTableList();
            const tablesWithNames = await Promise.all(
                tableList.map(async (table) => {
                    try {
                        const name = await table.getName();
                        return { id: table.id, name };
                    } catch (error) {
                        console.warn(`获取表格名称失败:`, error);
                        return { id: table.id, name: `表格-${table.id}` };
                    }
                })
            );
            setTableList(tablesWithNames);
        } catch (error) {
            console.error('获取数据表列表失败:', error);
        }
    }, []);

    const loadFieldList = useCallback(async (tableId: string) => {
        if (!tableId) {
            setFieldList([]);
            return;
        }
        try {
            const table = await bitable.base.getTableById(tableId);
            const fields = await table.getFieldList();
            
            const fieldsWithInfo = await Promise.all(
                fields.map(async (field) => {
                    try {
                        const name = await field.getName();
                        const type = await field.getType();
                        return { 
                            id: field.id, 
                            name, 
                            type
                        };
                    } catch (error) {
                        console.warn(`获取字段信息失败:`, error);
                        return { 
                            id: field.id, 
                            name: `字段-${field.id}`,
                            type: 0
                        };
                    }
                })
            );
            
            setFieldList(fieldsWithInfo);
        } catch (error) {
            console.error('获取字段列表失败:', error);
        }
    }, []);

    const loadPrizeByConfirm = useCallback(async (prizeTableId?: string, confirmFieldId?: string, prizeNameFieldId?: string, awardFieldId?: string, serverStatusFieldId?: string) => {
        const tableId = prizeTableId || config.prizeTableId;
        const confirmField = confirmFieldId || config.confirmFieldId;
        const nameField = prizeNameFieldId || config.prizeNameFieldId;
        const awardField = awardFieldId || config.awardFieldId;
        const statusField = serverStatusFieldId || config.serverStatusFieldId;

        if (!tableId || !confirmField || !nameField || !awardField) {
            setCurrentPrize('');
            setCurrentAward('');
            setServerStatus('');
            setCurrentRecordId('');
            setConfigError('');
            return;
        }
        try {
            const table = await bitable.base.getTableById(tableId);
            const recordListResult = await table.getRecordList();
            const confirmFieldObj = await table.getFieldById(confirmField);
            const prizeNameFieldObj = await table.getFieldById(nameField);
            const awardFieldObj = await table.getFieldById(awardField);

            let foundMatch = false;
            let matchCount = 0;
            let matchedRecordId = '';

            for (const record of recordListResult) {
                const confirmCell = await record.getCellByField(confirmFieldObj);
                const confirmValue = await confirmCell.getValue();

                if (confirmValue === true) {
                    matchCount++;
                    matchedRecordId = record.id;

                    if (matchCount === 1) {
                        const prizeNameCell = await record.getCellByField(prizeNameFieldObj);
                        const prizeValue = await prizeNameCell.getValue();

                        let prizeText = '';
                        if (typeof prizeValue === 'string') {
                            prizeText = prizeValue;
                        } else if (Array.isArray(prizeValue) && prizeValue.length > 0) {
                            const firstItem = prizeValue[0];

                            if (typeof firstItem === 'string') {
                                prizeText = firstItem;
                            } else if (firstItem && typeof firstItem === 'object' && firstItem !== null) {
                                prizeText = firstItem.text || firstItem.name || firstItem.value || JSON.stringify(firstItem);
                            } else {
                                prizeText = String(firstItem || '');
                            }
                        } else if (prizeValue && typeof prizeValue === 'object' && prizeValue !== null) {
                            prizeText = prizeValue.text || prizeValue.name || prizeValue.value || JSON.stringify(prizeValue);
                        } else {
                            prizeText = String(prizeValue || '');
                        }

                        setCurrentPrize(prizeText);
                        setCurrentRecordId(record.id);
                        foundMatch = true;

                        const awardCell = await record.getCellByField(awardFieldObj);
                        const awardValue = await awardCell.getValue();
                        const awardName = awardValue?.text || awardValue?.name || '';
                        setCurrentAward(awardName);

                        if (statusField) {
                            const statusFieldObj = await table.getFieldById(statusField);
                            const statusCell = await record.getCellByField(statusFieldObj);
                            const statusValue = await statusCell.getValue();
                            const statusName = statusValue?.text || statusValue?.name || '';
                            setServerStatus(statusName);
                        }
                    }
                }
            }

            if (matchCount === 0) {
                setCurrentPrize('');
                setCurrentAward('');
                setCurrentRecordId('');
                setConfigError('未找到勾选确认字段的记录');
            } else if (matchCount > 1) {
                setConfigError('检测到多条勾选确认字段的记录，请确保只有一条记录被勾选');
            } else {
                setConfigError('');
            }
        } catch (error) {
            console.error('获取奖品失败:', error);
            setCurrentPrize('');
            setCurrentAward('');
            setServerStatus('');
            setCurrentRecordId('');
            setConfigError('获取数据失败: ' + (error as Error).message);
        }
    }, [config]);

    const handleConfigChange = useCallback((key: string, value: string) => {
        setConfig(prev => {
            const newConfig = { ...prev, [key]: value };
            
            if (key === 'prizeTableId') {
                loadFieldList(value);
                return { ...newConfig, prizeNameFieldId: '', awardFieldId: '', confirmFieldId: '', serverStatusFieldId: '' };
            } else if (key === 'confirmFieldId') {
                setTimeout(() => {
                    loadPrizeByConfirm(
                        newConfig.prizeTableId,
                        value,
                        newConfig.prizeNameFieldId,
                        newConfig.awardFieldId,
                        newConfig.serverStatusFieldId
                    );
                }, 0);
                return newConfig;
            } else if (key === 'serverStatusFieldId') {
                if (newConfig.confirmFieldId) {
                    setTimeout(() => {
                        loadPrizeByConfirm(
                            newConfig.prizeTableId,
                            newConfig.confirmFieldId,
                            newConfig.prizeNameFieldId,
                            newConfig.awardFieldId,
                            value
                        );
                    }, 0);
                }
                return newConfig;
            } else if (key === 'prizeNameFieldId') {
                if (newConfig.confirmFieldId) {
                    setTimeout(() => {
                        loadPrizeByConfirm(
                            newConfig.prizeTableId,
                            newConfig.confirmFieldId,
                            value,
                            newConfig.awardFieldId,
                            newConfig.serverStatusFieldId
                        );
                    }, 0);
                }
                return newConfig;
            } else if (key === 'awardFieldId') {
                if (newConfig.confirmFieldId) {
                    setTimeout(() => {
                        loadPrizeByConfirm(
                            newConfig.prizeTableId,
                            newConfig.confirmFieldId,
                            newConfig.prizeNameFieldId,
                            value,
                            newConfig.serverStatusFieldId
                        );
                    }, 0);
                }
                return newConfig;
            }
            
            return newConfig;
        });
    }, [loadFieldList, loadPrizeByConfirm]);

    const saveConfig = () => {
        dashboard.saveConfig({
            customConfig: config,
            dataConditions: []
        } as any);
    };

    const updateConfig = useCallback((res: IConfig) => {
        if (res.customConfig) {
            const validatedConfig = {
                prizeTableId: typeof res.customConfig.prizeTableId === 'string' ? res.customConfig.prizeTableId : defaultConfig.prizeTableId,
                prizeNameFieldId: typeof res.customConfig.prizeNameFieldId === 'string' ? res.customConfig.prizeNameFieldId : defaultConfig.prizeNameFieldId,
                awardFieldId: typeof res.customConfig.awardFieldId === 'string' ? res.customConfig.awardFieldId : defaultConfig.awardFieldId,
                confirmFieldId: typeof res.customConfig.confirmFieldId === 'string' ? res.customConfig.confirmFieldId : defaultConfig.confirmFieldId,
                serverStatusFieldId: typeof res.customConfig.serverStatusFieldId === 'string' ? res.customConfig.serverStatusFieldId : defaultConfig.serverStatusFieldId
            };
            
            setConfig(validatedConfig);
            
            if (validatedConfig.prizeTableId) {
                loadFieldList(validatedConfig.prizeTableId);
            }
            if (validatedConfig.prizeTableId && validatedConfig.confirmFieldId && validatedConfig.prizeNameFieldId && validatedConfig.awardFieldId) {
                setTimeout(() => {
                    loadPrizeByConfirm(
                        validatedConfig.prizeTableId,
                        validatedConfig.confirmFieldId,
                        validatedConfig.prizeNameFieldId,
                        validatedConfig.awardFieldId,
                        validatedConfig.serverStatusFieldId
                    );
                }, 100);
            }
        } else {
            setConfig(defaultConfig);
        }
    }, [defaultConfig, loadFieldList, loadPrizeByConfirm]);

    const getContainerSize = () => {
        if (containerRef.current) {
            return {
                width: containerRef.current.offsetWidth,
                height: containerRef.current.offsetHeight
            };
        }
        return { width: 800, height: 600 };
    };

    const createThrownIcons = () => {
        const { width, height } = getContainerSize();
        const iconCount = Math.floor(width * height / (8000 * (5000 / var_zjsc)));
        const newIcons: Array<{ id: number; icon: string; style: React.CSSProperties }> = [];

        for (let i = 0; i < iconCount; i++) {
            const corner = Math.floor(Math.random() * 4);
            let startX = 0;
            let startY = 0;

            switch(corner) {
                case 0:
                    startX = -50;
                    startY = -50;
                    break;
                case 1:
                    startX = width;
                    startY = -50;
                    break;
                case 2:
                    startX = -50;
                    startY = height;
                    break;
                case 3:
                    startX = width;
                    startY = height;
                    break;
            }

            const endX = Math.random() * (width - 40) + 20;
            const endY = Math.random() * (height - 100) + 50;
            const throwDuration = (var_zjsc / 1000) * 0.6 + Math.random() * (var_zjsc / 1000) * 0.4;
            const animationDelay = Math.random() * (var_zjsc / 1000) * 0.4;

            newIcons.push({
                id: iconIdRef.current++,
                icon: getRandomIcon(),
                style: {
                    left: startX,
                    top: startY,
                    '--end-x': `${endX - startX}px`,
                    '--end-y': `${endY - startY}px`,
                    animation: `throwFromCorner ${throwDuration}s linear forwards`,
                    animationDelay: `${animationDelay}s`
                } as React.CSSProperties
            });
        }

        setFloatingIcons(newIcons);
    };

    const createFirework = () => {
        const { width, height } = getContainerSize();
        const x = Math.random() * (width - 100) + 50;
        const y = Math.random() * (height - 200) + 100;
        const isNear = Math.random() > 0.6;
        const baseSize = isNear ? 60 : 30;
        const particleCount = isNear ? 40 : 25;

        const fireworkId = fireworkIdRef.current++;
        const newFirework = {
            id: fireworkId,
            style: {
                left: x,
                top: y,
                width: baseSize,
                height: baseSize,
                background: fireworkColors[Math.floor(Math.random() * fireworkColors.length)],
                animation: 'fireworkExplode 1.5s ease-out forwards',
                filter: isNear ? 'blur(0px)' : 'blur(2px)',
                opacity: isNear ? 0.9 : 0.7
            } as React.CSSProperties
        };

        const newParticles: Array<{ id: number; style: React.CSSProperties }> = [];
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = baseSize * (0.5 + Math.random() * 1.5);
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;

            newParticles.push({
                id: particleIdRef.current++,
                style: {
                    left: x,
                    top: y,
                    width: baseSize * 0.2,
                    height: baseSize * 0.2,
                    background: fireworkColors[Math.floor(Math.random() * fireworkColors.length)],
                    '--tx': `${tx}px`,
                    '--ty': `${ty}px`,
                    animation: `fireworkParticle ${1 + Math.random() * 0.5}s ease-out forwards`,
                    animationDelay: `${Math.random() * 0.3}s`,
                    filter: isNear ? 'blur(0px)' : 'blur(1px)'
                } as React.CSSProperties
            });
        }

        setFireworks(prev => [...prev, newFirework]);
        setParticles(prev => [...prev, ...newParticles]);

        setTimeout(() => {
            setFireworks(prev => prev.filter(f => f.id !== fireworkId));
        }, 1500);

        setTimeout(() => {
            setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
        }, 2000);
    };

    const startFireworks = () => {
        fireworkTimerRef.current = setInterval(() => {
            createFirework();
        }, 300);
    };

    const createNaturalLeafPile = () => {
        const { width, height } = getContainerSize();
        const iconCount = Math.floor(width * 1.5);
        const baseLevel = height - 25;
        const newIcons: Array<{ id: number; icon: string; style: React.CSSProperties }> = [];

        for (let i = 0; i < iconCount; i++) {
            const x = Math.random() * (width - 40) + 20;
            let finalY;

            if (Math.random() < 0.3) {
                finalY = baseLevel - Math.random() * 15;
            } else if (Math.random() < 0.5) {
                finalY = baseLevel + (Math.random() - 0.5) * 8;
            } else {
                finalY = baseLevel + Math.random() * 10;
            }

            const midRotation = (Math.random() - 0.5) * 180;
            const finalRotation = (Math.random() - 0.5) * 45;
            const finalScale = 0.8 + Math.random() * 0.4;
            const finalOpacity = 0.6 + Math.random() * 0.4;

            newIcons.push({
                id: iconIdRef.current++,
                icon: getRandomIcon(),
                style: {
                    left: x,
                    bottom: height - finalY,
                    '--mid-rotation': `${midRotation}deg`,
                    '--final-rotation': `${finalRotation}deg`,
                    '--final-scale': finalScale,
                    '--final-opacity': finalOpacity,
                    '--final-y': `${finalY - baseLevel}px`,
                    animationDelay: `${Math.random() * 0.8}s`
                } as React.CSSProperties
            });
        }

        setFallenIcons(newIcons);
    };

    const createDenseConfetti = () => {
        const { width, height } = getContainerSize();
        const colors = ['#2196f3', '#03a9f4', '#00bcd4', '#4caf50', '#9c27b0', '#ff9800', '#e91e63'];
        const confettiCount = Math.floor(width * height / 800);
        const newConfetti: Array<{ id: number; style: React.CSSProperties }> = [];

        for (let i = 0; i < confettiCount; i++) {
            newConfetti.push({
                id: confettiIdRef.current++,
                style: {
                    left: Math.random() * width,
                    background: colors[Math.floor(Math.random() * colors.length)],
                    animation: `confettiFall ${2 + Math.random() * 2}s linear forwards`,
                    animationDelay: `${Math.random() * 1}s`,
                    borderRadius: Math.random() > 0.5 ? '50%' : '0'
                } as React.CSSProperties
            });
        }

        setConfetti(newConfetti);
    };

    const startLotteryAnimation = () => {
        if (isAnimating) return;

        setIsAnimating(true);
        setStatus('抽奖中');
        setStatusClass('status-text heartbeat');

        createThrownIcons();
        createDenseConfetti();
        startFireworks();

        animationTimerRef.current = setInterval(() => {
            createThrownIcons();
        }, 12000);
    };

    const stopLotteryAnimation = () => {
        setIsAnimating(false);
        setStatus('恭喜中奖');
        setStatusClass('status-text glow-effect');

        createNaturalLeafPile();

        setTimeout(() => {
            setFloatingIcons([]);
        }, 2000);

        if (animationTimerRef.current) {
            clearInterval(animationTimerRef.current);
            animationTimerRef.current = null;
        }
        if (fireworkTimerRef.current) {
            clearInterval(fireworkTimerRef.current);
            fireworkTimerRef.current = null;
        }
    };

    const resetAnimation = () => {
        setFloatingIcons([]);
        setFallenIcons([]);
        setConfetti([]);
        setFireworks([]);
        setParticles([]);
        setStatus('等待抽奖');
        setStatusClass('status-text');
        setIsAnimating(false);

        if (animationTimerRef.current) {
            clearInterval(animationTimerRef.current);
            animationTimerRef.current = null;
        }
        if (fireworkTimerRef.current) {
            clearInterval(fireworkTimerRef.current);
            fireworkTimerRef.current = null;
        }
    };

    useEffect(() => {
        configRef.current = config;
        isConfigRef.current = isConfig;
    }, [config, isConfig]);

    useEffect(() => {
        const isCreate = dashboard.state === DashboardState.Create;
        setIsConfig(dashboard.state === DashboardState.Config || isCreate);

        if (!isCreate) {
            dashboard.getConfig().then(updateConfig);
        }

        loadTableList();

        const offConfigChange = dashboard.onConfigChange((r) => {
            updateConfig(r.data);
        });

        return () => {
            if (animationTimerRef.current) {
                clearInterval(animationTimerRef.current);
            }
            if (fireworkTimerRef.current) {
                clearInterval(fireworkTimerRef.current);
            }
            offConfigChange();
        };
    }, []);

    useDashboardConfig(updateConfig);

    useEffect(() => {
        const { prizeTableId, confirmFieldId, awardFieldId, prizeNameFieldId, serverStatusFieldId } = config;
        
        if (!prizeTableId || !confirmFieldId || !awardFieldId || !prizeNameFieldId || !serverStatusFieldId) {
            return;
        }

        let isMounted = true;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        
        const getPollInterval = () => {
            switch (serverStatus) {
                case '准备中':
                case '已就绪':
                case '待开始':
                    return 500;
                case '已完成':
                default:
                    return 2000;
            }
        };

        const pollServerStatus = async () => {
            try {
                const table = await bitable.base.getTableById(prizeTableId);
                const confirmFieldObj = await table.getFieldById(confirmFieldId);
                const awardFieldObj = await table.getFieldById(awardFieldId);
                const prizeNameFieldObj = await table.getFieldById(prizeNameFieldId);
                const recordList = await table.getRecordList();
                
                let matchCount = 0;
                let matchedRecordId = '';
                let matchedStatus = '';

                for (const record of recordList) {
                    const confirmCell = await record.getCellByField(confirmFieldObj);
                    const confirmValue = await confirmCell.getValue();

                    if (confirmValue === true) {
                        matchCount++;
                        matchedRecordId = record.id;

                        if (matchCount === 1) {
                            const prizeNameCell = await record.getCellByField(prizeNameFieldObj);
                            const prizeValue = await prizeNameCell.getValue();

                            let prizeText = '';
                            if (typeof prizeValue === 'string') {
                                prizeText = prizeValue;
                            } else if (Array.isArray(prizeValue) && prizeValue.length > 0) {
                                const firstItem = prizeValue[0];
                                if (typeof firstItem === 'string') {
                                    prizeText = firstItem;
                                } else if (firstItem && typeof firstItem === 'object' && firstItem !== null) {
                                    prizeText = firstItem.text || firstItem.name || firstItem.value || JSON.stringify(firstItem);
                                } else {
                                    prizeText = String(firstItem || '');
                                }
                            } else if (prizeValue && typeof prizeValue === 'object' && prizeValue !== null) {
                                prizeText = prizeValue.text || prizeValue.name || prizeValue.value || JSON.stringify(prizeValue);
                            } else {
                                prizeText = String(prizeValue || '');
                            }

                            setCurrentPrize(prizeText);
                            setCurrentRecordId(record.id);

                            const awardCell = await record.getCellByField(awardFieldObj);
                            const awardValue = await awardCell.getValue();
                            const awardName = awardValue?.text || awardValue?.name || '';
                            setCurrentAward(awardName);

                            if (serverStatusFieldId) {
                                const statusFieldObj = await table.getFieldById(serverStatusFieldId);
                                const statusCell = await record.getCellByField(statusFieldObj);
                                const statusValue = await statusCell.getValue();
                                matchedStatus = statusValue?.text || statusValue?.name || '';
                            }
                        }
                    }
                }

                if (matchCount === 0) {
                    if (currentPrize !== '' || currentAward !== '') {
                        setCurrentPrize('');
                        setCurrentAward('');
                        setCurrentRecordId('');
                        setServerStatus('');
                        setConfigError('未找到勾选确认字段的记录');
                    }
                } else if (matchCount > 1) {
                    setConfigError('检测到多条勾选确认字段的记录，请确保只有一条记录被勾选');
                } else {
                    setConfigError('');
                    if (matchedStatus && matchedStatus !== serverStatus) {
                        setServerStatus(matchedStatus);
                    }
                }
            } catch (error) {
                console.error('轮询服务器状态失败:', error);
            }
        };

        const startPolling = () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
            intervalId = setInterval(pollServerStatus, getPollInterval());
        };

        startPolling();

        return () => {
            isMounted = false;
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [config, currentPrize, currentAward, serverStatus]);

    useEffect(() => {
        if (!serverStatus || serverStatus === lastServerStatusRef.current) return;

        lastServerStatusRef.current = serverStatus;

        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        switch (serverStatus) {
            case '待开始':
                resetAnimation();
                setStatus('等待抽奖');
                setStatusClass('status-text');
                setShowReadyStatus(false);
                isProcessingRef.current = false;
                break;
            case '准备中':
                if (!isAnimating) {
                    startLotteryAnimation();
                }
                setStatus('抽奖中');
                setStatusClass('status-text heartbeat');
                setShowReadyStatus(false);
                isProcessingRef.current = false;
                break;
            case '已就绪':
                if (!isAnimating) {
                    startLotteryAnimation();
                }
                setStatus('抽奖中');
                setStatusClass('status-text heartbeat');
                setShowReadyStatus(true);
                isProcessingRef.current = false;
                break;
            case '已完成':
                if (isAnimating) {
                    stopLotteryAnimation();
                }
                setShowReadyStatus(false);
                isProcessingRef.current = false;
                break;
            default:
                isProcessingRef.current = false;
        }
    }, [serverStatus, isAnimating]);

    return (
        <div className="lottery-wrapper">
            {isConfig && (
                <div className="config-panel">
                    <div className="form">
                        <h3 style={{ 
                            margin: '0 0 20px 0', 
                            color: '#1a1a1a', 
                            fontSize: '18px', 
                            fontWeight: '600',
                            borderBottom: '2px solid #1890ff', 
                            paddingBottom: '10px' 
                        }}>
                            抽奖配置
                        </h3>
                        
                        <div className="config-subsection">
                            <h4 style={{ 
                                margin: '0 0 12px 0', 
                                color: '#333', 
                                fontSize: '14px', 
                                fontWeight: '600' 
                            }}>
                                奖品表配置
                            </h4>
                            
                            <div className="config-item">
                                <label className="config-label">选择奖品表</label>
                                <div className="config-content">
                                    <select
                                        value={config.prizeTableId}
                                        onChange={(e) => handleConfigChange('prizeTableId', e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">请选择数据表</option>
                                        {tableList.map(table => (
                                            <option key={table.id} value={table.id}>{table.name}</option>
                                        ))}
                                    </select>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                        {tableList.length === 0 ? '请先加载数据' : `共 ${tableList.length} 个数据表可选`}
                                    </div>
                                </div>
                            </div>

                            <div className="config-item">
                                <label className="config-label">奖品名字段</label>
                                <div className="config-content">
                                    <select
                                        value={config.prizeNameFieldId}
                                        onChange={(e) => handleConfigChange('prizeNameFieldId', e.target.value)}
                                        style={{ width: '100%' }}
                                        disabled={!config.prizeTableId}
                                    >
                                        <option value="">请选择字段</option>
                                        {textFields.map(field => (
                                            <option key={field.id} value={field.id}>{field.name}</option>
                                        ))}
                                    </select>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                        选择文本类型字段用于显示奖品名称
                                    </div>
                                </div>
                            </div>

                            <div className="config-item">
                                <label className="config-label">奖项字段</label>
                                <div className="config-content">
                                    <select
                                        value={config.awardFieldId}
                                        onChange={(e) => handleConfigChange('awardFieldId', e.target.value)}
                                        style={{ width: '100%' }}
                                        disabled={!config.prizeTableId}
                                    >
                                        <option value="">请选择字段</option>
                                        {selectFields.map(field => (
                                            <option key={field.id} value={field.id}>{field.name}</option>
                                        ))}
                                    </select>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                        选择单选类型字段用于配置奖项
                                    </div>
                                </div>
                            </div>

                            <div className="config-item">
                                <label className="config-label">确认字段</label>
                                <div className="config-content">
                                    <select
                                        value={config.confirmFieldId}
                                        onChange={(e) => handleConfigChange('confirmFieldId', e.target.value)}
                                        style={{ width: '100%' }}
                                        disabled={!config.prizeTableId}
                                    >
                                        <option value="">请选择字段</option>
                                        {checkboxFields.map(field => (
                                            <option key={field.id} value={field.id}>{field.name}</option>
                                        ))}
                                    </select>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                        选择复选框类型字段用于确认当前抽奖记录
                                    </div>
                                </div>
                            </div>

                            <div className="config-item">
                                <label className="config-label">服务器状态字段</label>
                                <div className="config-content">
                                    <select
                                        value={config.serverStatusFieldId}
                                        onChange={(e) => handleConfigChange('serverStatusFieldId', e.target.value)}
                                        style={{ width: '100%' }}
                                        disabled={!config.prizeTableId}
                                    >
                                        <option value="">请选择字段</option>
                                        {selectFields.map(field => (
                                            <option key={field.id} value={field.id}>{field.name}</option>
                                        ))}
                                    </select>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                        选择单选类型字段用于控制动画状态
                                    </div>
                                </div>
                            </div>

                            {currentPrize && (
                                <div className="config-item prize-display">
                                    <label className="config-label">当前奖品</label>
                                    <div className="prize-value">{currentPrize}</div>
                                </div>
                            )}

                            {currentAward && (
                                <div className="config-item prize-display">
                                    <label className="config-label">当前奖项</label>
                                    <div className="prize-value">{currentAward}</div>
                                </div>
                            )}

                            {serverStatus && (
                                <div className="config-item prize-display">
                                    <label className="config-label">当前状态</label>
                                    <div className="prize-value">{serverStatus}</div>
                                </div>
                            )}

                            {configError && (
                                <div className="config-item error-display">
                                    <div className="error-message">{configError}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <button
                        className='btn'
                        onClick={saveConfig}
                        disabled={!config.prizeTableId || !config.prizeNameFieldId || !config.awardFieldId || !config.confirmFieldId || !config.serverStatusFieldId}
                        style={{ 
                            width: '100%', 
                            marginTop: '24px', 
                            height: '40px', 
                            fontWeight: '500',
                            fontSize: '14px',
                            background: '#1890ff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            opacity: (!config.prizeTableId || !config.prizeNameFieldId || !config.awardFieldId || !config.confirmFieldId || !config.serverStatusFieldId) ? 0.5 : 1
                        }}
                    >
                        保存配置
                    </button>
                </div>
            )}

            <div
                ref={containerRef}
                className={`lottery-container ${isConfig ? 'config-mode' : ''}`}
                style={{ backgroundColor: props.bgColor }}
            >
                <div className="light-effect"></div>
                <div className="light-effect-2"></div>

                <div className={statusClass}>{status}</div>
                {showReadyStatus && (
                    <div className="status-text heartbeat ready-status">已就绪</div>
                )}

                {floatingIcons.map(icon => (
                    <div key={icon.id} className="floating-icon" style={icon.style}>
                        {icon.icon}
                    </div>
                ))}

                {fallenIcons.map(icon => (
                    <div key={icon.id} className="fallen-icon" style={icon.style}>
                        {icon.icon}
                    </div>
                ))}

                {confetti.map(c => (
                    <div key={c.id} className="confetti" style={c.style}></div>
                ))}

                {fireworks.map(fw => (
                    <div key={fw.id} className="firework" style={fw.style}></div>
                ))}

                {particles.map(p => (
                    <div key={p.id} className="firework-particle" style={p.style}></div>
                ))}
            </div>
        </div>
    );
}
