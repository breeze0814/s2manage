export type BlCollectionSiteType = "sub2api" | "new_api";
export type BlCollectionAuthMode = "password" | "manual_token";

export type BlTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
};

export type BlCollectorClient = {
  login(email: string, password: string): Promise<BlTokenPayload>;
  refresh(refreshToken: string): Promise<BlTokenPayload>;
  groupsAvailable(accessToken: string): Promise<unknown[]>;
  groupRates(accessToken: string): Promise<Record<string, unknown>>;
  channelsAvailable(accessToken: string): Promise<unknown[]>;
};

export type BlCollectionSiteInput = {
  id?: number;
  connectionId: number;
  name: string;
  baseUrl: string;
  siteType: BlCollectionSiteType;
  email?: string;
  password?: string;
  newApiUserId?: string;
  authMode: BlCollectionAuthMode;
  enabled: boolean;
  intervalMin: number;
  rechargeRatio: number;
  proxyUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpire?: string;
};
