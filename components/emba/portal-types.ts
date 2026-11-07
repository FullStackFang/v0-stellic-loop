export type Review = { binding: string; clientId: string; action: string; revision: number; title: string; place: string; startsAt: string; endsAt: string; timezone: string; conditions: string; disclosure: string };
export type MemoryProposalReview = import('@/lib/emba/memory-review').MemoryReview & {binding:string;operationId:string};
export type PortalResult = { status: 'idle' | 'success' | 'error'; message: string; invitationToken?: string; review?: Review; memoryReview?: MemoryProposalReview; confirmationId?: string; exportJson?: string; planning?: Awaited<ReturnType<typeof import('@/lib/emba/planning').planForMe>> };
export type PortalAction = (previous: PortalResult, data: FormData) => Promise<PortalResult>;
