'use client';

import { useCallback, useEffect, useState } from 'react';
import { SurveyCreatorComponent, SurveyCreator } from 'survey-creator-react';
import 'survey-core/survey-core.min.css';
import 'survey-creator-core/survey-creator-core.min.css';

interface FormCreatorProps {
  initialSchema?: object;
  onSave?: (schema: object) => void;
}

export function FormCreator({ initialSchema, onSave }: FormCreatorProps) {
  const [creator, setCreator] = useState<SurveyCreator | null>(null);

  useEffect(() => {
    const surveyCreator = new SurveyCreator({
      showLogicTab: true,
      showJSONEditorTab: true,
      showTranslationTab: false,
      showEmbeddedSurveyTab: false,
    });

    // Set initial schema if provided
    if (initialSchema) {
      surveyCreator.JSON = initialSchema;
    }

    // Configure the creator
    surveyCreator.saveSurveyFunc = (saveNo: number, callback: (no: number, success: boolean) => void) => {
      if (onSave) {
        onSave(surveyCreator.JSON);
      }
      callback(saveNo, true);
    };

    setCreator(surveyCreator);
  }, [initialSchema, onSave]);

  const getSchema = useCallback(() => {
    return creator?.JSON || {};
  }, [creator]);

  // Expose getSchema method
  useEffect(() => {
    if (typeof window !== 'undefined' && creator) {
      (window as any).__formCreatorGetSchema = getSchema;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__formCreatorGetSchema;
      }
    };
  }, [creator, getSchema]);

  if (!creator) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading form builder...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-200px)] min-h-[600px]">
      <SurveyCreatorComponent creator={creator} />
    </div>
  );
}
