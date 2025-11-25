'use client';

import { useCallback, useEffect, useState } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';

interface FormRendererProps {
  schema: object;
  prefillData?: Record<string, unknown>;
  onComplete?: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export function FormRenderer({ schema, prefillData, onComplete, readOnly }: FormRendererProps) {
  const [survey, setSurvey] = useState<Model | null>(null);

  useEffect(() => {
    const surveyModel = new Model(schema);

    // Pre-fill data if provided
    if (prefillData) {
      surveyModel.data = prefillData;
    }

    // Set read-only mode if specified
    if (readOnly) {
      surveyModel.mode = 'display';
    }

    // Handle completion
    surveyModel.onComplete.add((sender) => {
      if (onComplete) {
        onComplete(sender.data);
      }
    });

    setSurvey(surveyModel);
  }, [schema, prefillData, onComplete, readOnly]);

  if (!survey) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-muted-foreground">Loading form...</div>
      </div>
    );
  }

  return (
    <div className="survey-container">
      <Survey model={survey} />
    </div>
  );
}
