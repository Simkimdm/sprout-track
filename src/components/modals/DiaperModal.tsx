import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import { useState, useEffect } from 'react';
import { DiaperType } from '@prisma/client';
import { DiaperLogResponse } from '@/app/api/types';
import { useLocalization } from '@/src/context/localization';
import { isDirtyDiaper } from '@/src/utils/diaperStats';
import { DiaperColorPicker, DiaperSmellSelect } from '@/src/components/forms/DiaperForm/diaper-selects';
import { DateTimePicker } from '@/src/components/ui/date-time-picker';
import { formatLocalDateTimeInput, parseLocalDateTimeInput } from '@/src/utils/dateTimeInput';

interface DiaperModalProps {
  open: boolean;
  onClose: () => void;
  babyId: string | undefined;
  initialTime: string;
  activity?: DiaperLogResponse;
  /**
   * Optional variant to control the modal styling
   */
  variant?: 'diaper' | 'default';
}

export default function DiaperModal({

  open,
  onClose,
  babyId,
  initialTime,
  activity,
  variant = 'default',
}: DiaperModalProps) {
  const { t } = useLocalization();
  const [formData, setFormData] = useState({
    time: initialTime,
    type: '' as DiaperType | '',
    condition: '',
    color: '',
    colorText: '',
    smell: '',
  });

  // Format date string as a local YYYY-MM-DDTHH:mm value for form state
  const formatDateForInput = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return formatLocalDateTimeInput(date);
  };

  useEffect(() => {
    if (open) {
      if (activity) {
        // Editing mode - populate with activity data
        setFormData({
          time: formatDateForInput(initialTime),
          type: activity.type,
          condition: activity.condition || '',
          color: activity.color || '',
          colorText: activity.colorText || '',
          smell: activity.smell || '',
        });
      } else {
        // New entry mode
        setFormData(prev => ({
          ...prev,
          time: formatDateForInput(initialTime)
        }));
      }
    }
  }, [open, initialTime, activity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!babyId) return;

    // Validate required fields
    if (!formData.type || !formData.time) {
      console.error('Required fields missing');
      return;
    }

    try {
      const payload = {
        babyId,
        time: formData.time,
        type: formData.type,
        // Condition/color/smell only apply when there's contents — clear stale values from a
        // previous type instead of carrying them into a WET/DRY log (e.g. DIRTY -> DRY).
        condition: isDirtyDiaper(formData.type) ? (formData.condition || null) : null,
        color: isDirtyDiaper(formData.type) ? (formData.color || null) : null,
        colorText: isDirtyDiaper(formData.type) && formData.color === 'OTHER' ? (formData.colorText || null) : null,
        smell: isDirtyDiaper(formData.type) ? (formData.smell || null) : null,
      };

      const response = await fetch(`/api/diaper-log${activity ? `?id=${activity.id}` : ''}`, {
        method: activity ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save diaper log');
      }

      onClose();
      
      // Reset form data
      setFormData({
        time: initialTime,
        type: '' as DiaperType | '',
        condition: '',
        color: '',
        colorText: '',
        smell: '',
      });
    } catch (error) {
      console.error('Error saving diaper log:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dialog-content !p-4 sm:!p-6">
        <DialogHeader className="dialog-header">
          <DialogTitle className="dialog-title">
            {activity ? 'Edit Diaper Change' : 'Log Diaper Change'}
          </DialogTitle>
          <DialogDescription className="dialog-description">
            {activity ? 'Update details about your baby\'s diaper change' : 'Record details about your baby\'s diaper change'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('Time')}</label>
              <DateTimePicker
                value={parseLocalDateTimeInput(formData.time)}
                onChange={(date) =>
                  setFormData({ ...formData, time: formatLocalDateTimeInput(date) })
                }
              />
            </div>
            <div>
              <label className="form-label">Type</label>
              <Select
                value={formData.type || ''}
                onValueChange={(value: DiaperType) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("Select type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WET">{t('Wet')}</SelectItem>
                  <SelectItem value="DIRTY">{t('Dirty')}</SelectItem>
                  <SelectItem value="BOTH">{t('Wet and Dirty')}</SelectItem>
                  <SelectItem value="DRY">{t('Dry')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {formData.type && isDirtyDiaper(formData.type) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="form-label">{t('Condition')}</label>
              <Select
                value={formData.condition}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, condition: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("Select condition")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">{t('Normal')}</SelectItem>
                  <SelectItem value="LOOSE">{t('Loose')}</SelectItem>
                  <SelectItem value="FIRM">{t('Firm')}</SelectItem>
                  <SelectItem value="OTHER">{t('Other')}</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <div className="sm:col-span-3">
                <label className="form-label">{t('Color')}</label>
              <DiaperColorPicker
                value={formData.color}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, color: value })
                }
              />
              {formData.color === 'OTHER' && (
                <Input
                  className="mt-2"
                  placeholder={t('Describe the color')}
                  value={formData.colorText}
                  onChange={(e) => setFormData({ ...formData, colorText: e.target.value })}
                />
              )}
              </div>
              <div>
                <label className="form-label">{t('Smell')}</label>
              <DiaperSmellSelect
                value={formData.smell}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, smell: value })
                }
              />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 mt-6">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="hover:bg-slate-50"
            >
              {t('Cancel')}
            </Button>
            <Button 
              type="submit"
              className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700"
            >
              {activity ? 'Update Change' : 'Save Change'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
