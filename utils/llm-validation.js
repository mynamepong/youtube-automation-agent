function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function toString(value) {
  return isNonEmptyString(value) ? value.trim() : '';
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function stripMarkdownJsonFence(text) {
  if (!isNonEmptyString(text)) {
    return '';
  }

  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const embeddedFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (embeddedFenceMatch) {
    return embeddedFenceMatch[1].trim();
  }

  return trimmed;
}

function safeParseJson(text) {
  const cleaned = stripMarkdownJsonFence(text);
  if (!cleaned) {
    return {
      ok: false,
      error: 'Empty JSON payload.',
      value: null,
    };
  }

  try {
    return {
      ok: true,
      error: null,
      value: JSON.parse(cleaned),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      value: null,
    };
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => toString(item))
    .filter(Boolean);
}

function normalizeSectionLike(entry, index = 0) {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    const content = toString(entry);
    if (!content) {
      return null;
    }

    return {
      title: `Section ${index + 1}`,
      content,
      duration: 60,
    };
  }

  if (!isPlainObject(entry)) {
    return null;
  }

  const title = toString(entry.title || entry.name || entry.heading) || `Section ${index + 1}`;
  const content = Array.isArray(entry.content)
    ? entry.content.map(line => toString(line)).filter(Boolean)
    : toString(entry.content || entry.body || entry.text || '');
  const durationValue = toNumber(entry.duration ?? entry.seconds ?? entry.length);

  const normalized = {
    title,
    content: content || '',
    duration: durationValue !== null ? durationValue : 60,
  };

  if (Array.isArray(entry.visuals) && entry.visuals.length > 0) {
    normalized.visuals = normalizeStringArray(entry.visuals);
  }

  if (Array.isArray(entry.points) && entry.points.length > 0) {
    normalized.points = normalizeStringArray(entry.points);
  }

  if (Array.isArray(entry.steps) && entry.steps.length > 0) {
    normalized.steps = entry.steps
      .map((step, stepIndex) => {
        if (!isPlainObject(step)) {
          return null;
        }

        const stepTitle = toString(step.title || step.name) || `Step ${stepIndex + 1}`;
        const description = toString(step.description || step.body || step.text);
        const tip = toString(step.tip || step.note);

        if (!stepTitle || !description) {
          return null;
        }

        const normalizedStep = {
          number: Number.isFinite(step.number) ? step.number : stepIndex + 1,
          title: stepTitle,
          description,
        };

        if (tip) {
          normalizedStep.tip = tip;
        }

        return normalizedStep;
      })
      .filter(Boolean);
  }

  if (Array.isArray(entry.items) && entry.items.length > 0) {
    normalized.items = entry.items
      .map((item, itemIndex) => {
        if (!isPlainObject(item)) {
          return null;
        }

        const itemTitle = toString(item.title || item.name) || `Item ${itemIndex + 1}`;
        const description = toString(item.description || item.body || item.text);
        const impact = toString(item.impact || item.note);

        if (!itemTitle || !description) {
          return null;
        }

        const normalizedItem = {
          number: Number.isFinite(item.number) ? item.number : itemIndex + 1,
          title: itemTitle,
          description,
        };

        if (impact) {
          normalizedItem.impact = impact;
        }

        return normalizedItem;
      })
      .filter(Boolean);
  }

  return normalized;
}

function normalizeSectionArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => normalizeSectionLike(entry, index))
    .filter(Boolean);
}

function normalizeChapters(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((chapter, index) => {
      if (!isPlainObject(chapter)) {
        return null;
      }

      const time = toString(chapter.time || chapter.timestamp || chapter.at);
      const title = toString(chapter.title || chapter.name || chapter.label);
      const seconds = toNumber(chapter.seconds);

      if (!time || !title) {
        return null;
      }

      const normalized = {
        time,
        title,
      };

      if (seconds !== null) {
        normalized.seconds = seconds;
      } else if (Number.isFinite(index)) {
        normalized.seconds = index * 60;
      }

      return normalized;
    })
    .filter(Boolean);
}

function normalizeColorObject(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const primary = toString(value.primary);
  const secondary = toString(value.secondary);
  const accent = toString(value.accent);

  if (!primary || !secondary || !accent) {
    return null;
  }

  return {
    primary,
    secondary,
    accent,
  };
}

function parseDurationToSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (!isNonEmptyString(value)) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d+:\d{2}$/.test(trimmed)) {
    const [minutes, seconds] = trimmed.split(':').map(Number);
    return (minutes * 60) + seconds;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.round(parsed));
  }

  return null;
}

function validateSchemaValue(value, schema, path = 'root') {
  const errors = [];

  const push = message => {
    errors.push(`${path}: ${message}`);
  };

  if (!schema) {
    return { valid: true, errors };
  }

  if (typeof schema === 'function') {
    try {
      const result = schema(value);
      if (result === true) {
        return { valid: true, errors };
      }

      if (result === false) {
        push('Custom validator returned false.');
        return { valid: false, errors };
      }

      if (typeof result === 'string' && result.trim()) {
        push(result.trim());
        return { valid: false, errors };
      }

      return { valid: true, errors };
    } catch (error) {
      push(error.message);
      return { valid: false, errors };
    }
  }

  const schemaType = schema.type;

  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    push(`Expected one of: ${schema.enum.join(', ')}`);
    return { valid: false, errors };
  }

  if (schemaType === 'object') {
    if (!isPlainObject(value)) {
      push('Expected an object.');
      return { valid: false, errors };
    }

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(`${path}.${key}: is required`);
        }
      }
    }

    if (schema.properties && isPlainObject(schema.properties)) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const childResult = validateSchemaValue(value[key], childSchema, `${path}.${key}`);
          if (!childResult.valid) {
            errors.push(...childResult.errors);
          }
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties && isPlainObject(schema.properties)) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          errors.push(`${path}.${key}: additional property not allowed`);
        }
      }
    }
  } else if (schemaType === 'array') {
    if (!Array.isArray(value)) {
      push('Expected an array.');
      return { valid: false, errors };
    }

    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      push(`Expected at least ${schema.minItems} items.`);
    }

    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      push(`Expected at most ${schema.maxItems} items.`);
    }

    if (schema.items) {
      value.forEach((item, index) => {
        const childResult = validateSchemaValue(item, schema.items, `${path}[${index}]`);
        if (!childResult.valid) {
          errors.push(...childResult.errors);
        }
      });
    }
  } else if (schemaType === 'string') {
    if (!isNonEmptyString(value)) {
      push('Expected a non-empty string.');
      return { valid: false, errors };
    }

    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      push(`Expected length >= ${schema.minLength}.`);
    }

    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      push(`Expected length <= ${schema.maxLength}.`);
    }

    if (schema.pattern) {
      const pattern = schema.pattern instanceof RegExp
        ? schema.pattern
        : new RegExp(schema.pattern);
      if (!pattern.test(value)) {
        push(`Value does not match pattern ${pattern}.`);
      }
    }
  } else if (schemaType === 'number' || schemaType === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      push('Expected a number.');
      return { valid: false, errors };
    }

    if (schemaType === 'integer' && !Number.isInteger(value)) {
      push('Expected an integer.');
    }

    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      push(`Expected >= ${schema.minimum}.`);
    }

    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      push(`Expected <= ${schema.maximum}.`);
    }
  } else if (schemaType === 'boolean') {
    if (typeof value !== 'boolean') {
      push('Expected a boolean.');
      return { valid: false, errors };
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const oneOfValid = schema.oneOf.some(option => validateSchemaValue(value, option, path).valid);
    if (!oneOfValid) {
      push('Did not match any allowed schema option.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function calculateDurationFromSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return null;
  }

  let totalSeconds = 0;
  let hasMeasuredSeconds = false;

  for (const section of sections) {
    if (!isPlainObject(section)) {
      continue;
    }

    const measured = parseDurationToSeconds(section.duration);
    if (measured !== null) {
      totalSeconds += measured;
      hasMeasuredSeconds = true;
    } else {
      totalSeconds += 60;
    }
  }

  if (!hasMeasuredSeconds && totalSeconds === 0) {
    return null;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function normalizeScriptPayload(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const title = toString(payload.title);
  const hook = isPlainObject(payload.hook) ? payload.hook : null;
  const introduction = isPlainObject(payload.introduction) ? payload.introduction : null;
  const conclusion = isPlainObject(payload.conclusion) ? payload.conclusion : null;
  const callToAction = isPlainObject(payload.callToAction) ? payload.callToAction : null;
  const keywords = normalizeStringArray(payload.keywords);
  const tone = toString(payload.tone) || 'informative';
  const pacing = toString(payload.pacing) || 'moderate';
  const fullScript = toString(payload.fullScript || payload.scriptBody || payload.body || payload.script);
  const sections = normalizeSectionArray(
    payload.mainContent?.sections
      || payload.sections
      || payload.scenes
      || payload.outline,
  );
  const duration = toString(payload.duration || payload.estimatedDuration);
  const metadata = isPlainObject(payload.metadata) ? payload.metadata : {};

  if (!title || !hook || !introduction || !conclusion || !callToAction || !fullScript || sections.length === 0 || keywords.length === 0) {
    return null;
  }

  const normalizedDuration = duration || calculateDurationFromSections(sections);
  if (!normalizedDuration) {
    return null;
  }

  return {
    title,
    hook,
    introduction,
    mainContent: {
      sections,
      totalDuration: typeof payload.mainContent?.totalDuration === 'number'
        ? payload.mainContent.totalDuration
        : payload.mainContent?.totalDuration || calculateDurationFromSections(sections),
    },
    conclusion,
    callToAction,
    fullScript,
    duration: normalizedDuration,
    tone,
    pacing,
    keywords,
    metadata,
  };
}

function normalizeSeoPayload(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const title = toString(payload.title);
  const description = toString(payload.description);
  const tags = normalizeStringArray(payload.tags);
  const hashtags = normalizeStringArray(payload.hashtags);
  const chapters = normalizeChapters(payload.chapters);
  const endScreen = isPlainObject(payload.endScreen) ? payload.endScreen : null;
  const metadata = isPlainObject(payload.metadata) ? payload.metadata : {};

  if (!title || title.length > 100 || !description || tags.length === 0 || hashtags.length === 0 || chapters.length === 0) {
    return null;
  }

  return {
    title,
    description,
    tags,
    hashtags,
    chapters,
    endScreen,
    metadata,
  };
}

function normalizeThumbnailPayload(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const conceptSource = isPlainObject(payload.concept) ? payload.concept : payload;
  const title = toString(conceptSource.title || payload.title);
  const style = toString(conceptSource.style);
  const primaryText = toString(conceptSource.primaryText);
  const secondaryText = toString(conceptSource.secondaryText);
  const elements = normalizeStringArray(conceptSource.elements);
  const colors = normalizeColorObject(conceptSource.colors);
  const emotion = toString(conceptSource.emotion);
  const composition = toString(conceptSource.composition);
  const prompt = toString(payload.prompt);
  const visualGuidance = toString(payload.visualGuidance);
  const styleGuidance = toString(payload.styleGuidance);
  const effects = isPlainObject(conceptSource.effects) ? conceptSource.effects : null;

  if (!title || !style || !primaryText || !secondaryText || !colors || elements.length === 0 || !emotion || !composition || !prompt) {
    return null;
  }

  return {
    concept: {
      title,
      style,
      primaryText,
      secondaryText,
      elements,
      colors,
      emotion,
      composition,
      ...(effects ? { effects } : {}),
    },
    prompt,
    ...(visualGuidance ? { visualGuidance } : {}),
    ...(styleGuidance ? { styleGuidance } : {}),
  };
}

function redactSensitiveText(value) {
  if (!isNonEmptyString(value)) {
    return '';
  }

  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/x-api-key["']?\s*[:=]\s*[^,\s}]+/gi, 'x-api-key:[REDACTED]')
    .replace(/authorization["']?\s*[:=]\s*[^,\s}]+/gi, 'authorization:[REDACTED]');
}

function sanitizeProviderError(error) {
  if (!error) {
    return {
      name: 'Error',
      message: 'Unknown error.',
      code: null,
      status: null,
      statusText: null,
      data: null,
    };
  }

  const responseData = error?.response?.data;
  let data = null;
  if (isNonEmptyString(responseData)) {
    data = redactSensitiveText(responseData.slice(0, 500));
  } else if (isPlainObject(responseData)) {
    const safeData = {};
    for (const [key, value] of Object.entries(responseData)) {
      if (key === 'headers' || key === 'request' || key === 'config') {
        continue;
      }
      if (isNonEmptyString(value)) {
        safeData[key] = redactSensitiveText(value.slice(0, 500));
      } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        safeData[key] = value;
      }
    }
    data = Object.keys(safeData).length > 0 ? safeData : null;
  }

  return {
    name: toString(error.name) || 'Error',
    message: redactSensitiveText(toString(error.message) || 'Unknown error.'),
    code: toString(error.code) || null,
    status: Number.isFinite(error?.response?.status) ? error.response.status : null,
    statusText: toString(error?.response?.statusText) || null,
    data,
  };
}

function isRecoverableProviderError(error) {
  if (!error) {
    return false;
  }

  const status = Number.isFinite(error?.response?.status) ? error.response.status : null;
  const code = toString(error.code).toUpperCase();

  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return true;
  }

  if (typeof status === 'number' && status >= 500) {
    return true;
  }

  if (['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNABORTED'].includes(code)) {
    return true;
  }

  if (!error.response && code) {
    return true;
  }

  return false;
}

module.exports = {
  calculateDurationFromSections,
  isNonEmptyString,
  isPlainObject,
  normalizeChapters,
  normalizeColorObject,
  normalizeScriptPayload,
  normalizeSectionArray,
  normalizeSeoPayload,
  normalizeStringArray,
  normalizeThumbnailPayload,
  parseDurationToSeconds,
  redactSensitiveText,
  sanitizeProviderError,
  safeParseJson,
  stripMarkdownJsonFence,
  toNumber,
  toString,
  validateSchemaValue,
  isRecoverableProviderError,
};
