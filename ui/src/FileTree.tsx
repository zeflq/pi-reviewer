export interface TreeNode {
  name: string;
  fullPath?: string;
  isDir: boolean;
  children: TreeNode[];
  commentCount: number;
}

export function buildTree(files: string[], commentsByFile: Record<string, number>): TreeNode[] {
  const root: TreeNode[] = [];

  function insert(nodes: TreeNode[], segments: string[], fullPath: string): void {
    const [head, ...rest] = segments;
    if (rest.length === 0) {
      nodes.push({ name: head, fullPath, isDir: false, children: [], commentCount: commentsByFile[fullPath] ?? 0 });
      return;
    }
    let dir = nodes.find((n) => n.isDir && n.name === head);
    if (!dir) {
      dir = { name: head, isDir: true, children: [], commentCount: 0 };
      nodes.push(dir);
    }
    insert(dir.children, rest, fullPath);
  }

  for (const file of files) {
    insert(root, file.split("/"), file);
  }

  function sumCounts(node: TreeNode): number {
    if (!node.isDir) return node.commentCount;
    node.commentCount = node.children.reduce((acc, c) => acc + sumCounts(c), 0);
    return node.commentCount;
  }

  root.forEach(sumCounts);
  return root;
}

const FolderIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#54aeff", flexShrink: 0 }}>
    <path d="M2 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
  </svg>
);

const FileIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

interface TreeNodesProps {
  nodes: TreeNode[];
  depth: number;
  collapsedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  folderPrefix: string;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

function TreeNodes({ nodes, depth, collapsedFolders, toggleFolder, folderPrefix, selectedFile, onSelectFile }: TreeNodesProps) {
  return (
    <>
      {nodes.map((node) => {
        const folderPath = folderPrefix ? `${folderPrefix}/${node.name}` : node.name;
        const collapsed = collapsedFolders[folderPath] ?? false;

        if (node.isDir) {
          return (
            <div key={folderPath}>
              <div
                className="tree-folder"
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => toggleFolder(folderPath)}
              >
                <span className="tree-chevron">{collapsed ? "▶" : "▼"}</span>
                <FolderIcon />
                <span className="tree-name">{node.name}</span>
                {node.commentCount > 0 && <span className="cbadge">{node.commentCount}</span>}
              </div>
              {!collapsed && (
                <TreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  collapsedFolders={collapsedFolders}
                  toggleFolder={toggleFolder}
                  folderPrefix={folderPath}
                  selectedFile={selectedFile}
                  onSelectFile={onSelectFile}
                />
              )}
            </div>
          );
        }

        return (
          <a
            key={node.fullPath}
            className={`tree-file${node.fullPath === selectedFile ? " tree-file-active" : ""}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            href={`#file-${CSS.escape(node.fullPath!)}`}
            onClick={(e) => { e.stopPropagation(); onSelectFile(node.fullPath!); }}
          >
            <FileIcon />
            <span className="tree-name">{node.name}</span>
            {node.commentCount > 0 && <span className="cbadge">{node.commentCount}</span>}
          </a>
        );
      })}
    </>
  );
}

interface FileTreeProps {
  tree: TreeNode[];
  collapsedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

export function FileTree({ tree, collapsedFolders, toggleFolder, selectedFile, onSelectFile }: FileTreeProps) {
  return (
    <div id="file-sidebar">
      <TreeNodes
        nodes={tree}
        depth={0}
        collapsedFolders={collapsedFolders}
        toggleFolder={toggleFolder}
        folderPrefix=""
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
      />
    </div>
  );
}
