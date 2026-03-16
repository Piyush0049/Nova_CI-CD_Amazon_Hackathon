'use client';

import { ReactNode } from 'react';
import { FaTimes, FaCheckCircle, FaExclamationCircle, FaInfoCircle } from 'react-icons/fa';
import Button from './Button';
import { Card } from './Card';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  type?: 'success' | 'error' | 'info' | 'default';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  actions?: ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  type = 'default',
  size = 'md',
  showCloseButton = true,
  actions,
}: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  const typeConfig = {
    success: {
      icon: FaCheckCircle,
      iconColor: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      titleColor: 'text-green-800 dark:text-green-200',
    },
    error: {
      icon: FaExclamationCircle,
      iconColor: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      titleColor: 'text-red-800 dark:text-red-200',
    },
    info: {
      icon: FaInfoCircle,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      titleColor: 'text-blue-800 dark:text-blue-200',
    },
    default: {
      icon: null,
      iconColor: '',
      bgColor: 'bg-white dark:bg-gray-900',
      borderColor: 'border-gray-200 dark:border-gray-800',
      titleColor: 'text-gray-900 dark:text-gray-100',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div
        className={`${config.bgColor} ${config.borderColor} rounded-lg shadow-2xl ${sizeClasses[size]} w-full max-h-[90vh] overflow-hidden border-2`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${config.borderColor}`}>
          <div className="flex items-center gap-3">
            {Icon && <Icon className={`text-2xl ${config.iconColor}`} />}
            <h2 className={`text-2xl font-bold ${config.titleColor}`}>{title}</h2>
          </div>
          {showCloseButton && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <FaTimes />
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 overflow-auto max-h-[calc(90vh-160px)] scrollbar-thin">
          {children}
        </div>

        {/* Footer */}
        {actions && (
          <div className={`flex items-center justify-end gap-3 p-6 border-t ${config.borderColor}`}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
