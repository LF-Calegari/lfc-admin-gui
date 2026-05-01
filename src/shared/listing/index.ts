/**
 * Barrel do módulo `src/shared/listing/`.
 *
 * Concentra primitives visuais reutilizados pelas páginas de
 * listagem do `lfc-admin-gui` (sistemas, rotas, roles, e os futuros
 * permissões/usuários/clientes). Cada página importa apenas o que
 * usa, mas o módulo único concentra a fonte de verdade do CSS.
 *
 * Lição PR #134/#135 — Sonar tokeniza CSS-in-JS como blocos de
 * texto e marca duplicação quando os mesmos templates literais
 * aparecem em arquivos diferentes. Centralizar aqui evita que cada
 * recurso novo (Issue #66+) refaça os mesmos `styled.div`.
 */

export {
  BackLink,
  CardDescription,
  CardHeader,
  CardCode,
  CardMeta,
  CardMetaTerm,
  CardMetaValue,
  CardName,
  CardListForMobile,
  DescriptionCell,
  EmptyHint,
  EmptyMessage,
  EmptyTitle,
  EntityCard,
  ErrorBlock,
  FootBar,
  InitialLoading,
  InvalidIdNotice,
  Mono,
  Overlay,
  PageInfo,
  PageNav,
  Placeholder,
  RowActions,
  SearchSlot,
  TableForDesktop,
  TableShell,
  Toolbar,
  ToolbarActions,
} from './styles';

export { ErrorRetryBlock } from './ErrorRetryBlock';
export { InitialLoadingSpinner } from './InitialLoadingSpinner';
export { ListingToolbar } from './ListingToolbar';
export { LiveRegion } from './LiveRegion';
export { PaginationFooter } from './PaginationFooter';
export { RefetchOverlay } from './RefetchOverlay';
export { StatusBadge } from './StatusBadge';
export {
  useListingLiveMessage,
  type ListingLiveMessageCopy,
} from './useListingLiveMessage';
