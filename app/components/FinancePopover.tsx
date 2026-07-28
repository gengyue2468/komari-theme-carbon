import { Dropdown, Popover, PopoverContent, Tile } from "@carbon/react";
import { Currency } from "@carbon/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DISPLAY_CURRENCIES,
  DEFAULT_EXCHANGE_RATES,
  buildFinanceSummary,
  getDailyExchangeRates,
  getStoredFinanceCurrency,
  setStoredFinanceCurrency,
  type CurrencyCode,
  type ExchangeRates,
} from "~/lib/finance";
import type { NodeInfo } from "~/types/komari";

interface FinancePopoverProps {
  nodes: NodeInfo[];
  label: string;
}

export function FinancePopover({ nodes, label }: FinancePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState<CurrencyCode>(() =>
    typeof window !== "undefined" ? getStoredFinanceCurrency() : "CNY",
  );
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_EXCHANGE_RATES);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getDailyExchangeRates().then(setRates);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary = useMemo(
    () => buildFinanceSummary(nodes, rates, base),
    [nodes, rates, base],
  );

  const items = useMemo(
    () => DISPLAY_CURRENCIES.map((c) => ({ id: c, text: c })),
    [],
  );

  return (
    <div ref={rootRef} className="finance-stat">
      <Popover
        open={open}
        align="bottom"
        caret
        dropShadow
        autoAlign
        onRequestClose={() => setOpen(false)}
        className="finance-popover"
      >
        <Tile
          className="home-stat-card home-stat-card--clickable"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls="finance-popover-panel"
          aria-label={label}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          <div className="home-stat-card__top row-between">
            <span className="home-stat-card__label">{label}</span>
            <Currency size={20} className="home-stat-card__icon" />
          </div>
          <div className="home-stat-card__value-row">
            <span className="home-stat-card__value mono">
              {summary.remaining.symbol}
              {summary.remaining.value}
            </span>
            <span className="home-stat-card__unit mono">
              {summary.remaining.currency}
            </span>
          </div>
        </Tile>

        <PopoverContent className="finance-popover__content">
          <div
            id="finance-popover-panel"
            className="finance-panel"
            role="dialog"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="finance-panel__summary">
              <div className="finance-panel__item">
                <span className="finance-panel__label">
                  {t("stats.totalValue")}
                </span>
                <span className="finance-panel__value mono">
                  <span className="finance-panel__sym">
                    {summary.total.symbol}
                  </span>
                  {summary.total.value}
                </span>
              </div>
              <div className="finance-panel__item">
                <span className="finance-panel__label">
                  {t("stats.monthlyCost")}
                </span>
                <span className="finance-panel__value mono">
                  <span className="finance-panel__sym">
                    {summary.monthly.symbol}
                  </span>
                  {summary.monthly.value}
                </span>
                <span className="finance-panel__hint mono">
                  {summary.monthly.currency}
                </span>
              </div>
              <div className="finance-panel__item">
                <span className="finance-panel__label">
                  {t("stats.remaining")}
                </span>
                <span className="finance-panel__value mono">
                  <span className="finance-panel__sym">
                    {summary.remaining.symbol}
                  </span>
                  {summary.remaining.value}
                </span>
              </div>
            </div>

            <div className="finance-panel__rates-head">
              <span className="finance-panel__label">
                {t("stats.exchangeRates")}
              </span>
              <Dropdown
                id="finance-base-currency"
                size="sm"
                label={t("stats.baseCurrency")}
                titleText=""
                hideLabel
                items={items}
                itemToString={(item) => (item ? item.text : "")}
                selectedItem={items.find((i) => i.id === base) ?? items[0]}
                onChange={({ selectedItem }) => {
                  if (!selectedItem) return;
                  const c = selectedItem.id as CurrencyCode;
                  setBase(c);
                  setStoredFinanceCurrency(c);
                }}
                className="finance-panel__dropdown"
              />
            </div>

            <div className="finance-panel__rates">
              {summary.rateRows.slice(0, 12).map((row) => (
                <div key={row.currency} className="finance-panel__rate mono">
                  <span className="finance-panel__rate-code">
                    {row.currency}
                  </span>
                  <span>
                    {row.symbol}
                    {row.rate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
