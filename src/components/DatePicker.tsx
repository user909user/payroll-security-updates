"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { getDaysInMonth, getDay } from "date-fns";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDisplay(value: string) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export default function DatePicker({ value, onChange, label, placeholder = "Select date" }: DatePickerProps) {
  const today = new Date();
  const initial = value
    ? (() => {
        const [y, m] = value.split("-").map(Number);
        return new Date(y, m - 1, 1);
      })()
    : new Date(today.getFullYear(), today.getMonth(), 1);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const display = formatDisplay(value);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = getDaysInMonth(firstOfMonth);
  const offset = (getDay(firstOfMonth) + 6) % 7;

  function select(day: number) {
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`);
    setOpen(false);
  }

  function isSameDay(y: number, m: number, d: number) {
    return today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
  }

  return (
    <div className="datepicker" ref={rootRef}>
      {label && (
        <label className="form-label" htmlFor={triggerId}>
          {label}
        </label>
      )}
      <button
        type="button"
        id={triggerId}
        className={`form-input datepicker__trigger${open ? " open" : ""}`}
        onClick={() => {
          if (open) { setOpen(false); return; }
          const base = value
            ? (() => {
                const [y, m] = value.split("-").map(Number);
                return new Date(y, m - 1, 1);
              })()
            : new Date(today.getFullYear(), today.getMonth(), 1);
          setViewYear(base.getFullYear());
          setViewMonth(base.getMonth());
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          } else if (open && (e.key === "Escape" || e.key === "Tab")) {
            setOpen(false);
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
      >
        <span className={display ? "" : "text-muted"}>{display ?? placeholder}</span>
        <CalendarDays size={18} strokeWidth={2.5} aria-hidden="true" />
      </button>

      {open && (
        <div id={popoverId} className="datepicker__popover" role="dialog" aria-label="Pick a date">
          <div className="datepicker__head">
            <button type="button" className="datepicker__nav" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="datepicker__title">
              {MONTHS[viewMonth]} <span className="datepicker__year">{viewYear}</span>
            </div>
            <button type="button" className="datepicker__nav" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="datepicker__weekdays">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="datepicker__weekday">
                {d}
              </span>
            ))}
          </div>

          <div className="datepicker__grid">
            {Array.from({ length: offset }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const isToday = isSameDay(viewYear, viewMonth, day);
              const isSelected = value === `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              return (
                <button
                  key={day}
                  type="button"
                  className={`datepicker__day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => select(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {value && (
            <div className="datepicker__footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(""); setOpen(false); }}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}