package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"

	"github.com/pranshuparmar/witr/internal/pipeline"
	"github.com/pranshuparmar/witr/internal/proc"
	"github.com/pranshuparmar/witr/internal/source"
	"github.com/pranshuparmar/witr/internal/target"
	"github.com/pranshuparmar/witr/internal/version"
	"github.com/pranshuparmar/witr/pkg/model"
)

type SystemInfo struct {
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Hostname  string `json:"hostname"`
	NumCPU    int    `json:"num_cpu"`
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"build_date"`
}

func jsonResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func jsonError(w http.ResponseWriter, statusCode int, message string) {
	jsonResponse(w, statusCode, map[string]string{"error": message})
}

func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	hostname, _ := os.Hostname()
	info := SystemInfo{
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		Hostname:  hostname,
		NumCPU:    runtime.NumCPU(),
		Version:   version.Version,
		Commit:    version.Commit,
		BuildDate: version.BuildDate,
	}
	jsonResponse(w, http.StatusOK, info)
}

func (s *Server) handleProcesses(w http.ResponseWriter, r *http.Request) {
	procs, err := proc.ListProcesses()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("failed to list processes: %v", err))
		return
	}

	selfPID := os.Getpid()
	filtered := make([]model.Process, 0, len(procs))
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))

	for _, p := range procs {
		if p.PID == selfPID {
			continue
		}
		if p.PPID == selfPID && (p.Command == "ps" || strings.HasPrefix(p.Command, "ps ")) {
			continue
		}

		if query != "" {
			nameMatch := strings.Contains(strings.ToLower(p.Command), query)
			cmdMatch := strings.Contains(strings.ToLower(p.Cmdline), query)
			pidMatch := strings.Contains(strconv.Itoa(p.PID), query)
			userMatch := strings.Contains(strings.ToLower(p.User), query)
			if !nameMatch && !cmdMatch && !pidMatch && !userMatch {
				continue
			}
		}
		filtered = append(filtered, p)
	}

	jsonResponse(w, http.StatusOK, filtered)
}

func (s *Server) handlePorts(w http.ResponseWriter, r *http.Request) {
	ports, err := proc.ListOpenPorts()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("failed to list ports: %v", err))
		return
	}
	jsonResponse(w, http.StatusOK, ports)
}

func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	containers := proc.ListAllContainers()
	jsonResponse(w, http.StatusOK, containers)
}

func (s *Server) handleLocks(w http.ResponseWriter, r *http.Request) {
	showAll := r.URL.Query().Get("all") == "true"
	var locks []*model.LockedFile
	if showAll {
		locks = mergeLocksAndOpenFiles(proc.ListLockedFiles(), proc.ListAllOpenFiles())
	} else {
		locks = proc.ListLockedFiles()
	}
	jsonResponse(w, http.StatusOK, locks)
}

func mergeLocksAndOpenFiles(locks, opens []*model.LockedFile) []*model.LockedFile {
	seen := make(map[string]struct{}, len(locks)+len(opens))
	key := func(l *model.LockedFile) string {
		return fmt.Sprintf("%d\x00%s", l.PID, l.Path)
	}

	merged := make([]*model.LockedFile, 0, len(locks)+len(opens))
	for _, l := range locks {
		merged = append(merged, l)
		seen[key(l)] = struct{}{}
	}
	for _, o := range opens {
		if _, dup := seen[key(o)]; dup {
			continue
		}
		merged = append(merged, o)
	}
	return merged
}

func (s *Server) handleAnalyze(w http.ResponseWriter, r *http.Request) {
	pidStr := r.URL.Query().Get("pid")
	portStr := r.URL.Query().Get("port")
	nameStr := r.URL.Query().Get("name")
	fileStr := r.URL.Query().Get("file")
	containerStr := r.URL.Query().Get("container")
	exact := r.URL.Query().Get("exact") == "true"

	var t model.Target
	var targetPID int

	if pidStr != "" {
		pid, err := strconv.Atoi(pidStr)
		if err != nil || pid <= 0 {
			jsonError(w, http.StatusBadRequest, "invalid pid")
			return
		}
		t = model.Target{Type: model.TargetPID, Value: pidStr}
		targetPID = pid
	} else if portStr != "" {
		t = model.Target{Type: model.TargetPort, Value: portStr}
	} else if nameStr != "" {
		t = model.Target{Type: model.TargetName, Value: nameStr}
	} else if fileStr != "" {
		t = model.Target{Type: model.TargetFile, Value: fileStr}
	} else if containerStr != "" {
		t = model.Target{Type: model.TargetContainer, Value: containerStr}
	} else {
		jsonError(w, http.StatusBadRequest, "must specify pid, port, name, file, or container parameter")
		return
	}

	if targetPID == 0 {
		if t.Type == model.TargetContainer {
			matches := proc.ResolveContainer(t.Value, exact)
			if len(matches) == 0 {
				jsonError(w, http.StatusNotFound, fmt.Sprintf("no container matching %q", t.Value))
				return
			}
			match := matches[0]
			proc.EnrichContainer(match)
			hostPID := proc.ResolveContainerHostPID(match.Runtime, match.ID)
			if hostPID > 0 && proc.PIDBelongsToContainer(hostPID, match.ID) {
				targetPID = hostPID
			} else {
				jsonResponse(w, http.StatusOK, map[string]interface{}{
					"container_only": true,
					"container":      match,
				})
				return
			}
		} else {
			pids, err := target.Resolve(t, exact)
			if err != nil || len(pids) == 0 {
				jsonError(w, http.StatusNotFound, fmt.Sprintf("target resolution failed: %v", err))
				return
			}
			targetPID = pids[0]
		}
	}

	res, err := pipeline.AnalyzePID(pipeline.AnalyzeConfig{
		PID:     targetPID,
		Verbose: true,
		Tree:    true,
		Target:  t,
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("analysis failed: %v", err))
		return
	}

	if t.Type == model.TargetPort {
		if portNum, err := strconv.Atoi(t.Value); err == nil && portNum > 0 {
			res.SocketInfo = proc.GetSocketStateForPort(portNum)
			source.EnrichSocketInfo(res.SocketInfo)
		}
	}

	jsonResponse(w, http.StatusOK, res)
}

type ActionRequest struct {
	PID    int    `json:"pid"`
	Action string `json:"action"` // kill, term, pause, resume, renice
	Value  int    `json:"value"`  // for renice
}

func (s *Server) handleAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req ActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, fmt.Sprintf("invalid request payload: %v", err))
		return
	}

	if req.PID <= 0 {
		jsonError(w, http.StatusBadRequest, "invalid pid")
		return
	}

	var err error
	switch req.Action {
	case "kill":
		err = killProcess(req.PID)
	case "term":
		err = termProcess(req.PID)
	case "pause":
		err = pauseProcess(req.PID)
	case "resume":
		err = resumeProcess(req.PID)
	case "renice":
		err = setNice(req.PID, req.Value)
	default:
		jsonError(w, http.StatusBadRequest, fmt.Sprintf("unknown action %q", req.Action))
		return
	}

	if err != nil {
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("action failed: %v", err))
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"pid":     req.PID,
		"action":  req.Action,
	})
}
