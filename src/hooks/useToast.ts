"use client";

import { useState, useCallback } from "react";
import { Toast, ToastType } from "@/components/ui/Toast";
import { generateId } from "@/lib/utils";

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    duration?: number
  ) => {
    const id = generateId();
    const toast: Toast = { id, type, title, message, duration };
    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string) => {
    return addToast("success", title, message);
  }, [addToast]);

  const error = useCallback((title: string, message?: string) => {
    return addToast("error", title, message);
  }, [addToast]);

  const info = useCallback((title: string, message?: string) => {
    return addToast("info", title, message);
  }, [addToast]);

  const warning = useCallback((title: string, message?: string) => {
    return addToast("warning", title, message);
  }, [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    info,
    warning,
  };
}
