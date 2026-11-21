import { ExternalLink, ThumbsUp, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '@/plate/api'
import { usePlate } from '@/plate/context'
import { ContextLine, KitchenTitle } from '@/plate/components'
import { useIdeas, useKitchens, useMe, usePlateMutation } from '@/plate/hooks'
import { inSelection, sortIdeas } from '@/plate/logic'
import { AvatarStack, ErrorLine, KitchenChip } from '@/plate/ui'
import { BackButton } from '@/nav/BackButton'

export default function PlateIdeas() {
  const me = useMe()
  const { selection, personalId, open } = usePlate()
  const kitchens = useKitchens().data ?? []
  const all = useIdeas().data
  const vote = usePlateMutation(({ id, voted }: { id: string; voted: boolean }) =>
    api.setIdeaVote(id, voted),
  )
  const remove = usePlateMutation(api.deleteIdea)
  const kitchen = kitchens.find((k) => k.id === selection)
  const ideas = sortIdeas(inSelection(all ?? [], selection), kitchens)
  const targetId = kitchen?.id ?? personalId

  return (
    <div className="space-y-4">
      <BackButton fallback="/plate/plan" />
      <div className="space-y-1">
        <KitchenTitle title="Cravings" mode="plan" />
        <ContextLine
          count={
            ideas.length === 0
              ? ''
              : kitchen?.is_personal
                ? `${ideas.length} saved`
                : `${ideas.length} craving${ideas.length === 1 ? '' : 's'}`
          }
        />
      </div>
      <p className="text-[13px] text-muted-foreground">
        {kitchen?.is_personal
          ? 'What you’re craving. Only you see this list.'
          : 'Vote for what you’re craving. The most-voted come first.'}
      </p>

      {all === undefined ? (
        <p className="text-sm text-muted-foreground">Loading ideas…</p>
      ) : ideas.length === 0 ? (
        <p className="pl-card p-5 text-center text-sm text-muted-foreground">
          No ideas yet. Save the dishes you're craving and plan them when the week has room.
        </p>
      ) : (
        <ul className="pl-card divide-y divide-white/[0.06]">
          {ideas.map((idea) => {
            const ideaKitchen = kitchens.find((k) => k.id === idea.group_id)
            const shared = ideaKitchen && !ideaKitchen.is_personal
            const voted = idea.votes.includes(me)
            return (
              <li key={idea.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                    <span className="truncate">{idea.title}</span>
                    {idea.recipe_url && (
                      <a
                        href={idea.recipe_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${idea.title} recipe`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </p>
                  {(!kitchen || (shared && idea.votes.length > 0)) && (
                    <div className="mt-1.5 flex items-center gap-2">
                      {!kitchen && ideaKitchen && <KitchenChip kitchen={ideaKitchen} />}
                      {shared && idea.votes.length > 0 && (
                        <AvatarStack userIds={idea.votes} size={18} max={4} />
                      )}
                    </div>
                  )}
                </div>
                {shared && (
                  <button
                    type="button"
                    aria-pressed={voted}
                    aria-label={
                      voted ? `Remove your vote for ${idea.title}` : `Vote for ${idea.title}`
                    }
                    onClick={() => vote.mutate({ id: idea.id, voted: !voted })}
                    className={cn(
                      'flex h-8 items-center gap-1 rounded-[10px] border px-2.5 text-xs font-semibold',
                      voted
                        ? 'border-white/20 bg-white/10'
                        : 'border-white/10 text-muted-foreground',
                    )}
                  >
                    <ThumbsUp size={14} className={cn(voted && 'fill-[#f5c542] text-[#f5c542]')} />
                    {idea.votes.length}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => open({ kind: 'meal', fromIdea: idea })}
                  className="pl-btn pl-btn-secondary h-8 rounded-[10px] px-3 text-xs"
                >
                  Plan it
                </button>
                {(idea.added_by === me || !shared) && (
                  <button
                    type="button"
                    aria-label={`Remove ${idea.title}`}
                    onClick={() => remove.mutate(idea.id)}
                    className="flex size-8 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ErrorLine error={vote.error ?? remove.error} />
      {targetId && (
        <button
          type="button"
          className="pl-btn pl-btn-primary w-full"
          onClick={() => open({ kind: 'idea', kitchenId: targetId })}
        >
          {kitchen?.is_personal ? 'Add a craving' : 'Suggest a craving'}
        </button>
      )}
    </div>
  )
}
