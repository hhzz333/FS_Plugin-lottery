import './style.scss';
import React from 'react';
import { dashboard, bitable, DashboardState, IConfig } from "@lark-base-open/js-sdk";
import { Button, Select, Toast } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useConfig } from '../../hooks';
import classnames from 'classnames'
import { useTranslation } from 'react-i18next';

/** 抽奖配置接口 */
interface ILotteryConfig {
  color: string;
  tableId: string;
  fieldId: string;
  participants: string[];
  spinDuration: number;
  dropDuration: number;
  showTitle: boolean;
  title: string;
}

const DEFAULT_COLOR = 'var(--ccm-chart-N700)';
const BALL_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3',
  '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43', '#ee5a24', '#0984e3'
];

/** 抽奖主组件 */
export default function Lottery(props: { bgColor: string }) {
  const { t, i18n } = useTranslation();

  const [config, setConfig] = useState<ILotteryConfig>({
    color: DEFAULT_COLOR,
    tableId: '',
    fieldId: '',
    participants: [],
    spinDuration: 3000,
    dropDuration: 1000,
    showTitle: true,
    title: t('lottery.title'),
  });

  const [tables, setTables] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const isCreate = dashboard.state === DashboardState.Create;
  const isConfig = dashboard.state === DashboardState.Config || isCreate;

  console.log('当前仪表盘状态:', dashboard.state);
  console.log('是否配置模式:', isConfig);

  useEffect(() => {
    if (isCreate) {
      setConfig({
        color: DEFAULT_COLOR,
        tableId: '',
        fieldId: '',
        participants: [],
        spinDuration: 3000,
        dropDuration: 1000,
        showTitle: true,
        title: t('lottery.title'),
      });
    }
  }, [i18n.language, isCreate]);

  const timer = useRef<number | null>(null);

  const updateConfig = (res: IConfig) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const { customConfig } = res;
    if (customConfig) {
      console.log('收到配置更新:', customConfig);
      setConfig(customConfig as any);
      timer.current = window.setTimeout(() => {
        dashboard.setRendered();
      }, 3000);
    }
  };

  useConfig(updateConfig);

  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      console.log('开始加载表格列表...');
      const tableList = await bitable.base.getTableList();
      console.log('获取到的表格列表:', tableList);
      setTables(tableList);
      
      if (tableList.length > 0 && !config.tableId) {
        const firstTable = tableList[0];
        console.log('默认选择第一个表格:', firstTable);
        setConfig(prev => ({
          ...prev,
          tableId: firstTable.id
        }));
      }
    } catch (error) {
      console.error('获取表格列表失败:', error);
      Toast.error(t('lottery.loadTableFailed'));
    } finally {
      setLoading(false);
    }
  }, [config.tableId, t]);

  const loadFields = useCallback(async (tableId: string) => {
    try {
      if (!tableId) return;
      
      console.log('开始加载字段列表，表格ID:', tableId);
      const table = await bitable.base.getTableById(tableId);
      const fieldList = await table.getFieldList();
      console.log('获取到的字段列表:', fieldList);
      
      // 过滤出文本类型的字段
      const textFields = fieldList.filter((field: any) => {
        const fieldType = field.type;
        // 文本类型字段：1-文本, 4-单选, 5-多选, 11-人员
        return fieldType === 1 || fieldType === 4 || fieldType === 5 || fieldType === 11;
      });
      
      console.log('过滤后的文本字段:', textFields);
      setFields(textFields);
      
      if (textFields.length > 0 && !config.fieldId) {
        const firstField = textFields[0];
        console.log('默认选择第一个字段:', firstField);
        setConfig(prev => ({
          ...prev,
          fieldId: firstField.id
        }));
      }
    } catch (error) {
      console.error('获取字段列表失败:', error);
      Toast.error(t('lottery.loadFieldFailed'));
    }
  }, [config.fieldId, t]);

  /** 从表格加载参与者数据 */
  const loadParticipantsFromTable = useCallback(async (tableId: string, fieldId: string) => {
    try {
      if (!tableId || !fieldId) return;
      
      console.log('开始加载参与者数据，表格:', tableId, '字段:', fieldId);
      const table = await bitable.base.getTableById(tableId);
      const recordList = await table.getRecordList();
      console.log('获取到的记录列表:', recordList);
      
      // 获取字段信息以确定字段类型
      const field = await table.getFieldById(fieldId);
      const fieldType = field.type;
      console.log('字段类型:', fieldType);
      
      const participants: string[] = [];
      
      for (const record of recordList) {
        try {
          const cellValue = await table.getCellValue(fieldId, record.id);
          console.log('单元格值类型:', typeof cellValue, '值:', cellValue);
          
          if (cellValue) {
            let name = '';
            const cellValueAny = cellValue as any;
            
            // 根据字段类型处理不同的数据格式
            switch (fieldType) {
              case 1: // 文本类型
                name = String(cellValueAny).trim();
                break;
                
              case 4: // 单选
              case 5: // 多选
                name = cellValueAny?.text ? String(cellValueAny.text).trim() : '';
                break;
                
              case 11: // 人员字段
                if (Array.isArray(cellValueAny) && cellValueAny.length > 0) {
                  const firstUser = cellValueAny[0];
                  name = firstUser?.name ? String(firstUser.name).trim() : '';
                }
                break;
                
              default:
                // 通用处理
                if (typeof cellValueAny === 'string') {
                  name = cellValueAny.trim();
                } else if (cellValueAny?.text) {
                  name = String(cellValueAny.text).trim();
                } else if (cellValueAny?.name) {
                  name = String(cellValueAny.name).trim();
                } else if (Array.isArray(cellValueAny) && cellValueAny.length > 0) {
                  const firstItem = cellValueAny[0];
                  if (firstItem && typeof firstItem === 'object' && 'name' in firstItem) {
                    name = String((firstItem as any).name).trim();
                  } else {
                    name = String(firstItem).trim();
                  }
                }
            }
            
            if (name && !participants.includes(name)) {
              participants.push(name);
            }
          }
        } catch (cellError) {
          console.warn('读取单元格失败:', cellError);
        }
      }
      
      console.log('最终参与者列表:', participants);
      setConfig(prev => ({
        ...prev,
        participants
      }));
      
      if (participants.length === 0) {
        Toast.warning(t('lottery.noParticipants'));
      } else {
        Toast.success(t('lottery.loadSuccess', { count: participants.length }));
      }
    } catch (error) {
      console.error('加载参与者数据失败:', error);
      Toast.error(t('lottery.loadDataFailed'));
    }
  }, [t]);

  // 初始化加载表格列表
  useEffect(() => {
    if (isConfig) {
      loadTables();
    }
  }, [isConfig, loadTables]);

  // 当表格选择变化时加载字段
  useEffect(() => {
    if (config.tableId && isConfig) {
      loadFields(config.tableId);
    }
  }, [config.tableId, isConfig, loadFields]);

  // 当字段选择变化时加载数据
  useEffect(() => {
    if (config.tableId && config.fieldId && isConfig) {
      loadParticipantsFromTable(config.tableId, config.fieldId);
    }
  }, [config.tableId, config.fieldId, isConfig, loadParticipantsFromTable]);

  return (
    <main 
      style={{
        backgroundColor: props.bgColor,
        paddingRight: isConfig ? '320px' : '0',
        minHeight: '100vh',
        position: 'relative',
        transition: 'padding-right 0.3s ease'
      }} 
      className={classnames({'main-config': isConfig, 'main': true})}
    >
      <div className='content'>
        <LotteryView
          t={t}
          config={config}
          isConfig={isConfig}
          loading={loading}
        />
      </div>
      
      {isConfig && (
        <ConfigPanel 
          t={t} 
          config={config} 
          setConfig={setConfig}
          tables={tables}
          fields={fields}
          loading={loading}
          onRefreshData={() => loadParticipantsFromTable(config.tableId, config.fieldId)}
        />
      )}
    </main>
  );
}

interface ILotteryView {
  config: ILotteryConfig;
  isConfig: boolean;
  loading: boolean;
  t: any;
}

function LotteryView({ config, isConfig, loading, t }: ILotteryView) {
  const { color, participants, spinDuration, dropDuration, showTitle, title } = config;
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number>(-1);

  const spinTimeoutRef = useRef<number | null>(null);

  const startSpin = useCallback(() => {
    if (isSpinning || participants.length === 0) return;
    
    setIsSpinning(true);
    setShowResult(false);
    setWinner(null);
    setWinnerIndex(-1);

    spinTimeoutRef.current = window.setTimeout(() => {
      setIsSpinning(false);
      setIsDropping(true);
      
      const randomIndex = Math.floor(Math.random() * participants.length);
      const randomWinner = participants[randomIndex];
      setWinner(randomWinner);
      setWinnerIndex(randomIndex);
      
      setTimeout(() => {
        setIsDropping(false);
        setShowResult(true);
      }, dropDuration);
    }, spinDuration);
  }, [isSpinning, participants, spinDuration, dropDuration]);

  const resetLottery = useCallback(() => {
    setIsSpinning(false);
    setIsDropping(false);
    setShowResult(false);
    setWinner(null);
    setWinnerIndex(-1);
    if (spinTimeoutRef.current) {
      clearTimeout(spinTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  if (participants.length === 0 && !isConfig) {
    return (
      <div className="no-participants">
        <div className="no-data-text">{t('lottery.noData')}</div>
        <div className="no-data-hint">{t('lottery.configHint')}</div>
      </div>
    );
  }

  return (
    <div className="lottery-main-content">
      {showTitle && (
        <h1 style={{ color }} className="lottery-title">
          {title}
        </h1>
      )}
      
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">{t('lottery.loading')}</div>
        </div>
      ) : (
        <div className="lottery-container">
          <div className="spherical-gashapon">
            <div className="gashapon-machine">
              <div className="machine-frame"></div>
              <div className="metal-trim top"></div>
              <div className="metal-trim bottom"></div>
              <div className="machine-top">
                <div className="top-ornament"></div>
              </div>
              <div className="glass-window">
                <div className="glass-highlight"></div>
              </div>
              
              <div className="balls-container">
                {participants.map((name, index) => (
                  <div
                    key={index}
                    className={classnames('lottery-ball', {
                      'static-ball': !isSpinning && !isDropping && !showResult,
                      'rolling-ball': isSpinning,
                      'dropping-ball': isDropping && winnerIndex === index,
                    })}
                    style={{
                      backgroundColor: BALL_COLORS[index % BALL_COLORS.length],
                    }}
                  >
                    <div className="ball-highlight"></div>
                  </div>
                ))}
              </div>
              
              <div className="drop-chute"></div>
              
              <div className="collection-tray">
                <div className="tray-edge"></div>
                {showResult && winner && (
                  <div
                    className="winner-ball-tray"
                    style={{
                      backgroundColor: BALL_COLORS[winnerIndex % BALL_COLORS.length],
                    }}
                  >
                    <div className="ball-highlight"></div>
                    <span className="ball-text">{winner}</span>
                  </div>
                )}
              </div>
              
              <div className="machine-base">
                <div className="base-details"></div>
              </div>
            </div>
          </div>
          
          <div className="participants-count">
            {t('lottery.participantsCount', { count: participants.length })}
          </div>
          
          {showResult && winner && (
            <div className="lottery-result" style={{ color }}>
              <div className="result-text">🎉 {t('lottery.congratulations')} 🎉</div>
              <div className="result-prize">{winner}</div>
            </div>
          )}
          
          {!isConfig && (
            <div className="lottery-controls">
              {!isSpinning && !showResult && (
                <Button 
                  theme="solid" 
                  type="primary" 
                  size="large"
                  onClick={startSpin}
                  className="lottery-button"
                  disabled={participants.length === 0}
                >
                  🎯 {t('lottery.start')}
                </Button>
              )}
              {showResult && (
                <Button 
                  theme="solid" 
                  type="secondary" 
                  size="large"
                  onClick={resetLottery}
                  className="lottery-button"
                >
                  🔄 {t('lottery.reset')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigPanel(props: {
  config: ILotteryConfig;
  setConfig: React.Dispatch<React.SetStateAction<ILotteryConfig>>;
  tables: any[];
  fields: any[];
  loading: boolean;
  onRefreshData: () => void;
  t: any;
}) {
  const { config, setConfig, tables, fields, loading, onRefreshData, t } = props;

  const onSaveConfig = () => {
    console.log('保存配置:', config);
    dashboard.saveConfig({
      customConfig: config,
      dataConditions: [],
    } as any).then(() => {
      Toast.success('配置保存成功');
    }).catch((error: any) => {
      console.error('保存配置失败:', error);
      Toast.error('保存配置失败');
    });
  };

  const handleTableChange = (value: any) => {
    const tableId = String(value);
    console.log('选择表格:', tableId);
    setConfig({
      ...config,
      tableId,
      fieldId: '',
      participants: [],
    });
  };

  const handleFieldChange = (value: any) => {
    const fieldId = String(value);
    console.log('选择字段:', fieldId);
    setConfig({
      ...config,
      fieldId,
      participants: [],
    });
  };

  return (
    <div className='config-panel' style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: '320px',
      background: '#f8f9fa',
      borderLeft: '1px solid #e1e5e9',
      zIndex: 1000,
      overflowY: 'auto',
      padding: '20px',
      boxShadow: '-2px 0 10px rgba(0, 0, 0, 0.1)'
    }}>
      <div className='form'>
        <div className='config-section'>
          <h3 style={{ margin: '0 0 16px 0', color: '#1a1a1a', fontSize: '16px', fontWeight: '600', borderBottom: '2px solid #1890ff', paddingBottom: '8px' }}>
            抽奖配置
          </h3>
          
          <div className='config-item'>
            <label className='config-label'>{t('lottery.showTitle')}</label>
            <div className='config-content'>
              <input
                type="checkbox"
                checked={config.showTitle}
                onChange={(e) => setConfig({...config, showTitle: e.target.checked})}
              />
            </div>
          </div>

          {config.showTitle && (
            <div className='config-item'>
              <label className='config-label'>{t('lottery.title')}</label>
              <div className='config-content'>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => setConfig({...config, title: e.target.value})}
                  className='config-input'
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d9d9d9', borderRadius: '4px', fontSize: '14px' }}
                />
              </div>
            </div>
          )}

          <div className='config-item'>
            <label className='config-label'>{t('lottery.selectTable')}</label>
            <div className='config-content'>
              <Select
                value={config.tableId}
                onChange={handleTableChange}
                style={{ width: '100%' }}
                placeholder={t('lottery.selectTablePlaceholder')}
                loading={loading}
              >
                {tables.map((table: any) => (
                  <Select.Option key={table.id} value={table.id}>
                    {table.name || `表格-${table.id}`}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </div>

          <div className='config-item'>
            <label className='config-label'>{t('lottery.selectField')}</label>
            <div className='config-content'>
              <Select
                value={config.fieldId}
                onChange={handleFieldChange}
                style={{ width: '100%' }}
                placeholder={t('lottery.selectFieldPlaceholder')}
                disabled={!config.tableId}
                loading={loading}
              >
                {fields.map((field: any) => (
                  <Select.Option key={field.id} value={field.id}>
                    {field.name || `字段-${field.id}`}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </div>

          <div className='config-item'>
            <label className='config-label'>
              {t('lottery.participantsPreview')}
              <Button 
                size="small" 
                onClick={onRefreshData}
                disabled={!config.tableId || !config.fieldId}
                loading={loading}
                style={{ marginLeft: '8px' }}
              >
                {t('lottery.refresh')}
              </Button>
            </label>
            <div className='config-content'>
              <div className='participants-preview'>
                {config.participants.length > 0 ? (
                  <>
                    <div className='participants-count-badge'>
                      {t('lottery.totalParticipants', { count: config.participants.length })}
                    </div>
                    <div className='participants-list'>
                      {config.participants.slice(0, 10).map((participant, index) => (
                        <div key={index} className='participant-preview-item'>
                          {participant}
                        </div>
                      ))}
                      {config.participants.length > 10 && (
                        <div className='participant-more'>
                          {t('lottery.andMore', { count: config.participants.length - 10 })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className='no-participants-preview'>
                    {t('lottery.noParticipantsPreview')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className='config-item'>
            <label className='config-label'>{t('lottery.spinDuration')}</label>
            <div className='config-content'>
              <input
                type="number"
                value={config.spinDuration}
                onChange={(e) => setConfig({...config, spinDuration: Number(e.target.value)})}
                className='config-input'
                min="1000"
                max="10000"
                style={{ width: '100px', padding: '8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}
              />
              <span className='config-unit'>ms</span>
            </div>
          </div>

          <div className='config-item'>
            <label className='config-label'>{t('lottery.dropDuration')}</label>
            <div className='config-content'>
              <input
                type="number"
                value={config.dropDuration}
                onChange={(e) => setConfig({...config, dropDuration: Number(e.target.value)})}
                className='config-input'
                min="500"
                max="5000"
                style={{ width: '100px', padding: '8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}
              />
              <span className='config-unit'>ms</span>
            </div>
          </div>

          <div className='config-item'>
            <label className='config-label'>{t('lottery.color')}</label>
            <div className='config-content'>
              <input
                type="color"
                value={config.color}
                onChange={(e) => setConfig({...config, color: e.target.value})}
                className='color-input'
                style={{ width: '50px', height: '40px', border: '1px solid #d9d9d9', borderRadius: '4px', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>
      </div>

      <Button
        className='btn'
        theme='solid'
        onClick={onSaveConfig}
        disabled={config.participants.length === 0}
        style={{ width: '100%', marginTop: '20px', height: '40px', fontWeight: '500' }}
      >
        {t('confirm')}
      </Button>
    </div>
  );
}