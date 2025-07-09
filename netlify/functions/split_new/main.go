package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"slices"
	"strconv"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/gorm"
)

type Request struct {
	Amount         float64            `json:"amount"`
	Description    string             `json:"description"`
	PaidByShares   map[string]float64 `json:"paidByShares"`
	Pin            string             `json:"pin"`
	SplitPctShares map[string]float64 `json:"splitPctShares"`
	Currency       string             `json:"currency"`

	SplitPctSharesByUserId map[int32]float64 `json:"-"`
	PaidBySharesByUserId   map[int32]float64 `json:"-"`
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod != "POST" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 400,
		}, nil
	}
	valid, session := common.Authenticate(request)
	if !valid {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "unauthorized",
		}, nil
	}
	var req = Request{}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       fmt.Sprintf("Error parsing input, %v", err.Error()),
		}, nil
	}

	if req.Pin != os.Getenv("AUTH_PIN") {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "invalid pin",
		}, nil
	}
	if err := validateSplitRequest(&req, session); err != nil {
		log.Default().Println(err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       err.Error(),
		}, nil
	}
	txn, txnUsers, err := createDBRecord(req, session)
	if err != nil {
		log.Default().Println(err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "error occurred",
		}, nil
	}

	err = saveTransactionToDB(txn, txnUsers)
	if err != nil {
		log.Default().Println(err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "error occurred saving in db",
		}, nil
	}
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       "Success split",
	}, nil
}

func main() {
	lambda.Start(handler)
}

func validateSplitRequest(req *Request, session *common.CurrentSession) error {
	if !slices.Contains(common.Currencies, req.Currency) {
		return fmt.Errorf("invalid currency")
	}
	if req.Amount <= 0 {
		return fmt.Errorf("invalid amount")
	}
	if req.Description == "" {
		return fmt.Errorf("invalid description")
	}
	req.PaidBySharesByUserId = make(map[int32]float64)

	paidByIds := make([]int32, 0, len(req.PaidByShares))
	for k, v := range req.PaidByShares {
		if v < 0 {
			return fmt.Errorf("invalid paidByShares")
		}
		id, err := strconv.ParseInt(k, 10, 32)
		if err != nil {
			return err
		}
		paidByIds = append(paidByIds, int32(id))
		req.PaidBySharesByUserId[int32(id)] = v
	}
	slices.Sort(paidByIds)
	userIds := []int32{}
	err := json.Unmarshal([]byte(session.Group.Userids), &userIds)
	if err != nil {
		return err
	}
	slices.Sort(userIds)
	for _, id := range paidByIds {
		if !slices.Contains(userIds, id) {
			return fmt.Errorf("invalid paidByShares")
		}
	}

	totalAmount := 0.0
	for _, v := range req.PaidByShares {
		totalAmount += v
	}
	if totalAmount != req.Amount {
		return fmt.Errorf("invalid paidByShares")
	}
	splitIds := make([]int32, 0, len(req.SplitPctShares))
	req.SplitPctSharesByUserId = make(map[int32]float64)
	totalPct := 0.0
	for k, v := range req.SplitPctShares {
		id, err := strconv.ParseInt(k, 10, 32)
		if err != nil {
			return err
		}
		if v < 0 || v > 100 {
			return fmt.Errorf("invalid splitPctShares")
		}
		totalPct += v
		splitIds = append(splitIds, int32(id))
		req.SplitPctSharesByUserId[int32(id)] = v
	}
	slices.Sort(splitIds)
	if slices.Compare(splitIds, userIds) != 0 {
		return fmt.Errorf("invalid splitIds")
	}

	if totalPct != 100.0 {
		return fmt.Errorf("invalid splitPctShares")
	}
	return nil
}

func getSplitAmounts(req Request) ([]common.TransactionUser, error) {
	amounts := []common.TransactionUser{}
	owed := make(map[int32]float64)
	totalOwed := 0.0
	owedToUserIds := []int32{}
	for k, v := range req.SplitPctSharesByUserId {
		o := req.PaidBySharesByUserId[k] - (req.Amount * v / 100)
		owed[k] = o
		if o >= 0 {
			owedToUserIds = append(owedToUserIds, k)
			totalOwed += o
		}
	}
	for k, v := range owed {
		// credit
		if v > 0 {
			continue
		}
		for _, owedToUserId := range owedToUserIds {
			amt := 0.0
			if totalOwed != 0 {
				amt = math.Abs(owed[owedToUserId] / totalOwed * v)
			}
			amounts = append(amounts, common.TransactionUser{
				UserId:       k,
				Amount:       amt,
				OwedToUserId: owedToUserId,
				Currency:     req.Currency,
			})
		}
	}
	return amounts, nil
}

func createDBRecord(req Request, session *common.CurrentSession) (common.Transaction, []common.TransactionUser, error) {
	transaction := common.Transaction{
		Amount:      req.Amount,
		Description: req.Description,
		CreatedAt:   common.SQLiteTime{Time: time.Now()},
		Currency:    req.Currency,
		GroupId:     session.Group.Groupid,
	}
	transactionUsers, err := getSplitAmounts(req)
	if err != nil {
		return transaction, transactionUsers, err
	}
	paidByShares := map[string]float64{}
	for k, v := range req.PaidBySharesByUserId {
		paidByShares[session.UsersById[k].FirstName] = v
	}
	owedAmounts := map[string]float64{}
	for k, v := range req.SplitPctSharesByUserId {
		owedAmounts[session.UsersById[k].FirstName] = req.Amount * v / 100
	}
	owedToAmounts := map[string]float64{}
	for _, txnUser := range transactionUsers {
		owedToAmounts[session.UsersById[txnUser.OwedToUserId].FirstName] += txnUser.Amount
	}
	metadata, err := json.Marshal(common.TransactionMetadata{
		PaidByShares:  paidByShares,
		OwedAmounts:   owedAmounts,
		OwedToAmounts: owedToAmounts,
	})
	if err != nil {
		return transaction, transactionUsers, err
	}
	transaction.Metadata = string(metadata)
	for i := range transactionUsers {
		transactionUsers[i].GroupId = session.Group.Groupid
	}
	return transaction, transactionUsers, nil
}

func saveTransactionToDB(txn common.Transaction, txnUsers []common.TransactionUser) error {
	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		return fmt.Errorf("DSN_D1 environment variable not set")
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		return fmt.Errorf("[split_new] failed to connect to db: %w", err)
	}
	txn.TransactionId, err = common.GenerateRandomID(16)
	if err != nil {
		return err
	}
	for i := range txnUsers {
		txnUsers[i].TransactionId = txn.TransactionId
	}
	return commitTransaction(db, txn, txnUsers)
}

func commitTransaction(db *gorm.DB, txn common.Transaction, txnUsers []common.TransactionUser) error {
	tx := db.Begin()
	tx.SavePoint("sp1")
	err := tx.Create(&txn).Error
	if err != nil {
		tx.RollbackTo("sp1") // Rollback
		return err
	}
	err = tx.Transaction(func(txTxn *gorm.DB) error {
		for _, txnUser := range txnUsers {
			txnUser.TransactionId = txn.TransactionId
			if err := txTxn.Create(&txnUser).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		tx.RollbackTo("sp1") // Rollback
		return err
	}

	tx.Commit()
	return nil
}
