import type { BrowTemplateId } from '../../types/brow'
import type { FaceAnalysisResult } from '../../types/face'

export interface BrowRecommendation {
  templateId: BrowTemplateId
  reason: string
}

export function recommendBrowTemplate(analysis: FaceAnalysisResult): BrowRecommendation {
  const faceRatio = analysis.metrics?.faceRatio ?? 1.32

  if (faceRatio >= 1.48) {
    return {
      templateId: 'straight',
      reason: '你的脸部比例偏修长，平眉能柔和纵向比例。',
    }
  }

  if (faceRatio <= 1.25) {
    return {
      templateId: 'standard',
      reason: '你的脸型比例偏圆润，略带眉峰更显立体。',
    }
  }

  if (faceRatio >= 1.38) {
    return {
      templateId: 'arched',
      reason: '你的脸部线条较舒展，柔和弯眉能提升亲和感。',
    }
  }

  return {
    templateId: 'natural',
    reason: '你的脸部比例较均衡，自然眉更适合日常妆容。',
  }
}
