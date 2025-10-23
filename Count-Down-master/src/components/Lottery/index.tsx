import './style.scss';
import React, { useLayoutEffect, useMemo } from 'react';
import { dashboard, bitable, DashboardState, IConfig, ITable, IField, IRecord } from "@lark-base-open/js-sdk";
import { Button, Select, Toast } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useConfig } from '../../hooks';
import classnames from 'classnames'
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next/typescript/t';

/** 抽奖配置接口 */
interface ILotteryConfig {
  color: string;
  tableId: string; // 选择的表格ID
  fieldId: string; // 选择的字段ID
  participants: string[]; // 从表格获取的参与者名单
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

  // 创建时的默认配置
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

  // 表格和字段列表
  const [tables, setTables] = useState<ITable[]>([]);
  const [fields, setFields] = useState<IField[]>([]);
  const [loading, setLoading] = useState(false);

  const isCreate = dashboard.state === DashboardState.Create;

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

  /** 是否配置/创建模式下 */
  const isConfig = dashboard.state === DashboardState.Config || isCreate;

  const timer = useRef<any>();

  /** 配置用户配置 */
  const updateConfig = (res: IConfig) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const { customConfig } = res;
    if (customConfig) {
      setConfig(customConfig as any);
      timer.current = setTimeout(() => {
        dashboard.setRendered();
      }, 3000);
    }
  };

  useConfig(updateConfig);

  /** 获取表格列表 */
  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      const tableList = await bitable.base.getTableList();
      setTables(tableList);
      
      // 如果有表格但没有选择，默认选择第一个表格
      if (tableList.length > 0 && !config.tableId) {
        const firstTable = tableList[0];
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

  /** 获取字段列表 */
  const loadFields = useCallback(async (tableId: string) => {
    try {
      if (!tableId) return;
      
      const table = await bitable.base.getTableById(tableId);
      const fieldList = await table.getFieldList();
      
      // 过滤出文本类型的字段
      const textFields = fieldList.filter(field => 
        field.type === 1 // 文本类型
      );
      
      setFields(textFields);
      
      // 如果有文本字段但没有选择，默认选择第一个文本字段
      if (textFields.length > 0 && !config.fieldId) {
        const firstField = textFields[0];
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
      
      const table = await bitable.base.getTableById(tableId);
      const recordList = await table.getRecordList();
      
      const participants: string[] = [];
      
      for (const record of recordList) {
        const cellValue = await table.getCellValue(fieldId, record.recordId);
        if (cellValue && typeof cellValue === 'object' && 'text' in cellValue) {
          const name = (cellValue as any).text?.trim();
          if (name && !participants.includes(name)) {
            participants.push(name);
          }
        }
      }
      
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
    <main style={{backgroundColor: props.bgColor}} className={classnames({'main-config': isConfig, 'main': true})}>
      <div className='content'>
        <LotteryView
          t={t}
          config={config}
          isConfig={isConfig}
          loading={loading}
          key={config.participants.join(',')} // 参与者变化时重新渲染
        />
      </div>
      {
        isConfig && (
          <ConfigPanel 
            t={t} 
            config={config} 
            setConfig={setConfig}
            tables={tables}
            fields={fields}
            loading={loading}
            onRefreshData={() => loadParticipantsFromTable(config.tableId, config.fieldId)}
          />
        )
      }
    </main>
  );
}

/** 抽奖显示组件 Props */
interface ILotteryView {
  config: ILotteryConfig;
  isConfig: boolean;
  loading: boolean;
  t: TFunction<"translation", undefined>;
}

/** 抽奖显示组件 */
function LotteryView({ config, isConfig, loading, t }: ILotteryView) {
  const { color, participants, spinDuration, dropDuration, showTitle, title } = config;
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number>(-1);

  const spinTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startSpin = useCallback(() => {
    if (isSpinning || participants.length === 0) return;
    
    setIsSpinning(true);
    setShowResult(false);
    setWinner(null);
    setWinnerIndex(-1);

    spinTimeoutRef.current = setTimeout(() => {
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

  // 清理定时器
  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  // 如果没有参与者数据
  if (participants.length === 0 && !isConfig) {
    return (
      <div className="no-participants">
        <div className="no-data-text">{t('lottery.noData')}</div>
        <div className="no-data-hint">{t('lottery.configHint')}</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', textAlign: 'center', overflow: 'hidden' }}>
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
            {/* 你的扭蛋机UI结构保持不变 */}
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
              
              {/* 彩球容器 */}
              <div className="balls-container">
                {participants.map((name, index) => (
                  <div
                    key={index}
                    className={classnames('lottery-ball', {
                      'static-ball': !isSpinning && !isDropping && !showResult,
                      'rolling-ball': isSpinning,
                      [`ball-${index + 1}`]: isSpinning,
                      'dropping-ball': isDropping && winnerIndex === index,
                      'static-ball': showResult && winnerIndex !== index,
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
          
          {/* 参与者统计 */}
          <div className="participants-count">
            {t('lottery.participantsCount', { count: participants.length })}
          </div>
          
          {/* 中奖结果 */}
          {showResult && winner && (
            <div className="lottery-result" style={{ color }}>
              <div className="result-text">🎉 {t('lottery.congratulations')} 🎉</div>
              <div className="result-prize">{winner}</div>
            </div>
          )}
          
          {/* 控制按钮 - 仅在非配置模式下显示 */}
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

/** 配置面板组件 */
function ConfigPanel(props: {
  config: ILotteryConfig;
  setConfig: React.Dispatch<React.SetStateAction<ILotteryConfig>>;
  tables: ITable[];
  fields: IField[];
  loading: boolean;
  onRefreshData: () => void;
  t: TFunction<"translation", undefined>;
}) {
  const { config, setConfig, tables, fields, loading, onRefreshData, t } = props;

  /** 保存配置 */
  const onSaveConfig = () => {
    dashboard.saveConfig({
      customConfig: config,
      dataConditions: [],
    } as any);
  };

  /** 处理表格选择 */
  const handleTableChange = (tableId: string) => {
    setConfig({
      ...config,
      tableId,
      fieldId: '', // 清空字段选择
      participants: [], // 清空参与者数据
    });
  };

  /** 处理字段选择 */
  const handleFieldChange = (fieldId: string) => {
    setConfig({
      ...config,
      fieldId,
      participants: [], // 清空参与者数据
    });
  };

  return (
    <div className='config-panel'>
      <div className='form'>
        {/* 标题设置 */}
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
              />
            </div>
          </div>
        )}

        {/* 表格选择 */}
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
              {tables.map(table => (
                <Select.Option key={table.id} value={table.id}>
                  {table.name}
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>

        {/* 字段选择 */}
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
              {fields.map(field => (
                <Select.Option key={field.id} value={field.id}>
                  {field.name}
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>

        {/* 参与者预览 */}
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

        {/* 动画时长设置 */}
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
            />
            <span className='config-unit'>ms</span>
          </div>
        </div>

        {/* 主题颜色 */}
        <div className='config-item'>
          <label className='config-label'>{t('lottery.color')}</label>
          <div className='config-content'>
            <input
              type="color"
              value={config.color}
              onChange={(e) => setConfig({...config, color: e.target.value})}
              className='color-input'
            />
          </div>
        </div>
      </div>

      <Button
        className='btn'
        theme='solid'
        onClick={onSaveConfig}
        disabled={config.participants.length === 0}
      >
        {t('confirm')}
      </Button>
    </div>
  );
}