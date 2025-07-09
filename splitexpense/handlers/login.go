package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type Metadata struct {
	DefaultShare    map[string]float64 `json:"defaultShare"`
	DefaultCurrency string             `json:"defaultCurrency"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Username string        `json:"username"`
	GroupId  int32         `json:"groupId"`
	Budgets  []string      `json:"budgets"`
	Users    []common.User `json:"users"`
	Userids  []int32       `json:"userids"`
	Metadata Metadata      `json:"metadata"`
	UserId   int32         `json:"userId"`
}

type User struct {
	common.User
	Password string
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodOptions {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	var req LoginRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	log.Println("body", string(body))
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		http.Error(w, "Internal server error: DSN not configured", http.StatusInternalServerError)
		return
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		http.Error(w, "[login] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	user := User{}
	tx := db.Select("id, username, first_name, groupid, password").Where("username = ?", req.Username).First(&user)
	if tx.Error != nil {
		http.Error(w, "[login] error reading user from db", http.StatusInternalServerError)
		return
	}
	if user.Password != req.Password {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	sessionId, err := common.GenerateRandomID(16)
	if err != nil {
		http.Error(w, "error generating session id", http.StatusInternalServerError)
		return
	}

	group := common.Group{}
	tx = db.Select("groupid, budgets, userids, metadata").Where("groupid = ?", user.Groupid).First(&group)
	if tx.Error != nil {
		http.Error(w, "[login] error reading group from db", http.StatusInternalServerError)
		return
	}

	budgets := []string{}
	err = json.Unmarshal([]byte(group.Budgets), &budgets)
	if err != nil {
		http.Error(w, "[login] error parsing budgets from group", http.StatusInternalServerError)
		return
	}

	metadata := Metadata{}
	err = json.Unmarshal([]byte(group.Metadata), &metadata)
	if err != nil {
		http.Error(w, "[login] error parsing metadata from group", http.StatusInternalServerError)
		return
	}

	userIds := []int32{}
	err = json.Unmarshal([]byte(group.Userids), &userIds)
	if err != nil {
		http.Error(w, "[login] error parsing userids from group", http.StatusInternalServerError)
		return
	}

	users := []common.User{}
	tx = db.Select("id, username, first_name, groupid").Where("id in ?", userIds).Find(&users)
	if tx.Error != nil {
		http.Error(w, "[login] error reading users from db", http.StatusInternalServerError)
		return
	}

	expiration := time.Now().Add(24 * time.Hour)
	tx = db.Create(&common.Session{
		Username:   req.Username,
		Sessionid:  sessionId,
		ExpiryTime: common.SQLiteTime{Time: expiration},
	})
	if tx.Error != nil {
		http.Error(w, "[login] error creating session in db", http.StatusInternalServerError)
		return
	}

	sessionCookie := http.Cookie{
		Name:     "sessionid",
		Value:    sessionId,
		Expires:  expiration,
		HttpOnly: true,
		Path:     "/",
	}
	http.SetCookie(w, &sessionCookie)

	b, _ := json.Marshal(LoginResponse{
		Username: req.Username,
		GroupId:  user.Groupid,
		Budgets:  budgets,
		Users:    users,
		Userids:  userIds,
		Metadata: metadata,
		UserId:   user.Id,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}
