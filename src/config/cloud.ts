export const cloudConfig = {
  env: 'cloud1-d4gmfknrz08ee27da',
}

export function hasCloudEnv(): boolean {
  return cloudConfig.env.trim().length > 0
}
